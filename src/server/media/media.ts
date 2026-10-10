import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Connection, Prisma } from "@prisma/client";
import {
  MAX_SHELF, MAX_SPEAKERS, clampVolume, isMediaPlayer, resumeAt, speakerStateOf, totalOf, trackAt, withStarts,
  type MediaChoice, type MediaSetup, type MediaSource, type Queue, type ShelfItem, type Speaker, type SpeakerState,
} from "@/lib/media";
import type { Tx } from "../db";
import { decryptSecret, encryptSecret, sign, verify } from "../crypto";
import { UserError, notFound } from "../errors";
import { id } from "../validation";
import { callService, haConfig, listStates, readState, type HaStoredConfig } from "../homeassistant";
import { errorMessage, log } from "../log";
import * as JF from "./jellyfin";
import * as ABS from "./audiobookshelf";
import { openUpstream } from "./upstream";

/**
 * Listening (§23, §20 D61): the kids' shelf. The admin connects Jellyfin
 * (music) and Audiobookshelf (audiobooks) and puts a few albums, playlists
 * and books on the shelf, each for every child or for some. Screens only
 * ever name a shelf item by Kindo's id; which server, which files and which
 * account that means is decided here, and only shelf items play. Sound
 * reaches a screen through Kindo (`/api/media/…`), and a speaker through a
 * signed address that works for one file for a few hours.
 */
const httpUrl = z.string().trim().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "http(s) only");
const shelfId = z.string().regex(/^[a-z0-9]{6,24}$/);
const speakerId = z.string().trim().regex(/^media_player\.[a-z0-9_]+$/, "a media player").max(255);
export const M = {
  addJellyfin: z.object({ url: httpUrl, username: z.string().trim().min(1).max(200), password: z.string().max(500) }),
  addAudiobookshelf: z.object({ url: httpUrl, apiKey: z.string().trim().min(10).max(2000) }),
  browse: z.object({ id, search: z.string().max(100).default("") }),
  shelf: z.object({
    id,
    items: z.array(z.object({
      id: shelfId.optional(), remoteId: z.string().min(1).max(200), kind: z.enum(["album", "playlist", "book"]),
      name: z.string().trim().min(1).max(60), memberIds: z.array(id).max(20),
    })).max(MAX_SHELF).refine((i) => new Set(i.map((x) => x.remoteId)).size === i.length, "each item once"),
  }),
  account: z.object({ id, memberId: id, apiKey: z.string().trim().max(2000) }),
  byId: z.object({ id }),
  queue: z.object({ itemId: shelfId, memberId: id.optional() }),
  progress: z.object({ itemId: shelfId, memberId: id.optional(), position: z.number().min(0).max(1_000_000) }),
  speakers: z.object({
    id,
    speakers: z.array(z.object({ entityId: speakerId, name: z.string().trim().min(1).max(40), maxVolume: z.number().int().min(0).max(100) })).max(MAX_SPEAKERS)
      .refine((s) => new Set(s.map((x) => x.entityId)).size === s.length, "each speaker once"),
  }),
  cast: z.object({ itemId: shelfId, memberId: id.optional(), speaker: speakerId }),
  speaker: z.object({ speaker: speakerId, command: z.enum(["play", "pause", "stop", "volume"]), volume: z.number().min(0).max(100).optional() }),
  none: z.object({}).optional(),
};
type In<K extends keyof typeof M> = z.output<(typeof M)[K]>;
const json = (v: unknown) => v as Prisma.InputJsonValue;
const MEDIA_KINDS = ["jellyfin", "audiobookshelf"] as const;

/** Non-secret settings on a media connection (`Connection.config`). */
export interface MediaStoredConfig {
  /** Jellyfin: the user Kindo signed in as. */
  userId?: string;
  shelf?: ShelfItem[];
}

const cfgOf = (c: Pick<Connection, "config">) => (c.config ?? {}) as MediaStoredConfig;
export const shelfOf = (c: Pick<Connection, "config">): ShelfItem[] => cfgOf(c).shelf ?? [];
const isMedia = (c: Pick<Connection, "kind">): c is Pick<Connection, "kind"> & { kind: MediaSource } => (MEDIA_KINDS as readonly string[]).includes(c.kind);
const newId = () => randomBytes(8).toString("hex");

export const speakersOf = (ha: Pick<Connection, "config"> | null | undefined): Speaker[] => ((ha?.config ?? {}) as HaStoredConfig).speakers ?? [];

/** What every screen may know: the shelf's names and whose they are, and the speakers' names. */
export function mediaSetupOf(connections: Pick<Connection, "kind" | "config">[]): MediaSetup | null {
  const shelf = connections.filter(isMedia).flatMap((c) => shelfOf(c).map((s) => ({ id: s.id, kind: s.kind, name: s.name, memberIds: s.memberIds, source: c.kind as MediaSource })));
  if (!shelf.length) return null;
  const ha = connections.find((c) => c.kind === "homeassistant");
  return { shelf, speakers: speakersOf(ha).map(({ entityId, name }) => ({ entityId, name })) };
}

// ── Connecting ───────────────────────────────────────────────────────────────
/** Connects Jellyfin: signs in as the user whose music the children may hear; only the token is kept. */
export async function addJellyfin(db: Tx, input: In<"addJellyfin">) {
  const me = await JF.signIn(input.url, input.username, input.password);
  const conn = await db.connection.create({
    data: {
      kind: "jellyfin", name: new URL(input.url).host, url: input.url, username: me.name, secret: encryptSecret(me.token),
      config: json({ userId: me.userId, shelf: [] } satisfies MediaStoredConfig), status: "ok", lastSyncAt: new Date(),
    },
  });
  return conn.id;
}

/** Connects Audiobookshelf with an account's API key. */
export async function addAudiobookshelf(db: Tx, input: In<"addAudiobookshelf">) {
  const me = await ABS.whoAmI({ url: input.url, token: input.apiKey });
  const conn = await db.connection.create({
    data: {
      kind: "audiobookshelf", name: new URL(input.url).host, url: input.url, username: me.username || null, secret: encryptSecret(input.apiKey),
      config: json({ shelf: [] } satisfies MediaStoredConfig), status: "ok", lastSyncAt: new Date(),
    },
  });
  return conn.id;
}

/**
 * Changes a media connection's address or account (the cog in Settings).
 * Jellyfin signs in again when a password is given; otherwise the token must
 * still work at the (new) address. The shelf stays.
 */
export async function updateMediaConnection(db: Tx, conn: Connection, input: { name?: string; url?: string; username?: string; secret?: string }) {
  const url = input.url ?? conn.url ?? "";
  if (conn.kind === "jellyfin") {
    let token = conn.secret ? decryptSecret(conn.secret) : "";
    let me: { userId: string; name: string };
    if (input.secret) {
      const r = await JF.signIn(url, input.username || conn.username || "", input.secret);
      token = r.token;
      me = r;
    } else {
      if (input.username && input.username !== conn.username) throw new UserError("invalid", "another user needs their password");
      me = await JF.whoAmI(url, token);
    }
    await db.connection.update({
      where: { id: conn.id },
      data: { name: input.name || conn.name, url, username: me.name, secret: encryptSecret(token), config: json({ ...cfgOf(conn), userId: me.userId }), status: "ok", lastError: null, lastSyncAt: new Date() },
    });
  } else if (conn.kind === "audiobookshelf") {
    const token = input.secret || (conn.secret ? decryptSecret(conn.secret) : "");
    const me = await ABS.whoAmI({ url, token });
    await db.connection.update({
      where: { id: conn.id },
      data: { name: input.name || conn.name, url, username: me.username || null, secret: encryptSecret(token), status: "ok", lastError: null, lastSyncAt: new Date() },
    });
  }
  forgetTracks(conn.id);
}

/** "Sync now": nothing to sync, so it checks that the server still answers and the account still works. */
export async function checkMedia(db: Tx, conn: Connection) {
  try {
    if (conn.kind === "jellyfin") await JF.whoAmI(conn.url ?? "", decryptSecret(conn.secret ?? ""));
    else await ABS.whoAmI(absTarget(conn));
    await db.connection.update({ where: { id: conn.id }, data: { status: "ok", lastError: null, lastSyncAt: new Date() } });
  } catch (e) {
    await db.connection.update({ where: { id: conn.id }, data: { status: "error", lastError: errorMessage(e).slice(0, 500), lastSyncAt: new Date() } });
    throw e;
  }
  forgetTracks(conn.id);
}

const jfTarget = (c: Connection): JF.JellyfinTarget => ({ url: c.url ?? "", token: c.secret ? decryptSecret(c.secret) : "", userId: cfgOf(c).userId ?? "" });
const absTarget = (c: Connection, token?: string): ABS.AbsTarget => ({ url: c.url ?? "", token: token ?? (c.secret ? decryptSecret(c.secret) : "") });

async function mediaById(db: Tx, connId: string) {
  const conn = await db.connection.findUnique({ where: { id: connId } });
  if (!conn || !isMedia(conn)) throw notFound("connection");
  return conn;
}

// ── The shelf (admin) ────────────────────────────────────────────────────────
/** What the server has, for the admin to put on the shelf. */
export async function browse(db: Tx, input: In<"browse">): Promise<MediaChoice[]> {
  const conn = await mediaById(db, input.id);
  return conn.kind === "jellyfin" ? JF.browse(jfTarget(conn), input.search) : ABS.browse(absTarget(conn), input.search);
}

/** Saves the shelf. An item keeps its id while it stays, so screens playing it carry on. */
export async function saveShelf(db: Tx, input: In<"shelf">) {
  const conn = await mediaById(db, input.id);
  const members = new Set((await db.member.findMany({ select: { id: true } })).map((m) => m.id));
  const old = new Map(shelfOf(conn).map((s) => [s.remoteId, s.id]));
  const shelf: ShelfItem[] = input.items.map((i) => ({
    id: old.get(i.remoteId) ?? newId(), remoteId: i.remoteId, kind: conn.kind === "audiobookshelf" ? "book" : i.kind, name: i.name,
    memberIds: i.memberIds.filter((m) => members.has(m)),
  }));
  await db.connection.update({ where: { id: conn.id }, data: { config: json({ ...cfgOf(conn), shelf } satisfies MediaStoredConfig) } });
}

/** Which children have their own Audiobookshelf account, by name. */
export async function listAccounts(db: Tx, input: In<"byId">) {
  await mediaById(db, input.id);
  const rows = await db.mediaAccount.findMany({ where: { connectionId: input.id }, select: { memberId: true, username: true } });
  return rows;
}

/** Links a child to their own Audiobookshelf account (an empty key unlinks). The key is checked first. */
export async function saveAccount(db: Tx, input: In<"account">) {
  const conn = await mediaById(db, input.id);
  if (conn.kind !== "audiobookshelf") throw new UserError("invalid", "only Audiobookshelf keeps a place per child");
  const member = await db.member.findUnique({ where: { id: input.memberId } });
  if (!member) throw notFound("member");
  if (!input.apiKey) {
    await db.mediaAccount.deleteMany({ where: { connectionId: conn.id, memberId: member.id } });
    return;
  }
  const me = await ABS.whoAmI(absTarget(conn, input.apiKey));
  const data = { username: me.username || member.name, secret: encryptSecret(input.apiKey) };
  await db.mediaAccount.upsert({ where: { connectionId_memberId: { connectionId: conn.id, memberId: member.id } }, create: { connectionId: conn.id, memberId: member.id, ...data }, update: data });
}

// ── Playing ──────────────────────────────────────────────────────────────────
/** A shelf item and its connection. Only what is on the shelf can be played. */
export async function itemOf(db: Tx, itemId: string) {
  const conns = await db.connection.findMany({ where: { kind: { in: [...MEDIA_KINDS] } } });
  for (const conn of conns) {
    const item = shelfOf(conn).find((s) => s.id === itemId);
    if (item) return { conn, item };
  }
  throw notFound("shelf item");
}

interface RemoteTrack { remoteId: string; title: string; duration: number }
// Each play, cover and seek asks for the files: one read of the server serves them for a while.
const TRACKS_MS = 5 * 60_000;
const g = globalThis as unknown as { kindoMediaTracks?: Map<string, { at: number; tracks: Promise<RemoteTrack[]> }> };
const trackCache = (g.kindoMediaTracks ??= new Map());
function forgetTracks(connId: string) {
  for (const k of trackCache.keys()) if (k.startsWith(`${connId}|`)) trackCache.delete(k);
}

async function remoteTracks(conn: Connection, item: ShelfItem, now = Date.now()): Promise<RemoteTrack[]> {
  const key = `${conn.id}|${item.remoteId}`;
  const hit = trackCache.get(key);
  if (hit && now - hit.at < TRACKS_MS) return hit.tracks;
  const tracks = conn.kind === "jellyfin" ? JF.tracks(jfTarget(conn), item.remoteId, item.kind) : ABS.tracks(absTarget(conn), item.remoteId);
  trackCache.set(key, { at: now, tracks });
  tracks.catch(() => trackCache.delete(key));
  return tracks;
}

/** The account a child listens with: their own, or the connection's. */
async function accountFor(db: Tx, conn: Connection, memberId?: string): Promise<ABS.AbsTarget> {
  if (memberId) {
    const own = await db.mediaAccount.findUnique({ where: { connectionId_memberId: { connectionId: conn.id, memberId } } });
    if (own) return absTarget(conn, decryptSecret(own.secret));
  }
  return absTarget(conn);
}

/** What a screen needs to play a shelf item: its files, and for an audiobook the child's place in it. */
export async function queue(db: Tx, input: In<"queue">): Promise<Queue> {
  const { conn, item } = await itemOf(db, input.itemId);
  const tracks = withStarts(await remoteTracks(conn, item));
  if (!tracks.length) throw new UserError("remote", "nothing to play in this item");
  let position = 0;
  const resumable = conn.kind === "audiobookshelf";
  if (resumable) {
    const p = await ABS.progress(await accountFor(db, conn, input.memberId), item.remoteId).catch((e) => {
      log.warn("audiobook place unreadable", { error: errorMessage(e) });
      return { position: 0, finished: false };
    });
    position = p.finished ? 0 : resumeAt(p.position, totalOf(tracks));
  }
  return { itemId: item.id, tracks, position, resumable };
}

/** Saves the child's place in an audiobook (their account, or the connection's). */
export async function saveProgress(db: Tx, input: In<"progress">) {
  const { conn, item } = await itemOf(db, input.itemId);
  if (conn.kind !== "audiobookshelf") return;
  const total = totalOf(withStarts(await remoteTracks(conn, item)));
  await ABS.saveProgress(await accountFor(db, conn, input.memberId), item.remoteId, Math.min(input.position, total || input.position), total);
}

/** The upstream address and headers of one file of a shelf item. */
async function trackSource(db: Tx, itemId: string, index: number) {
  const { conn, item } = await itemOf(db, itemId);
  const track = (await remoteTracks(conn, item))[index];
  if (!track) throw notFound("track");
  if (conn.kind === "jellyfin") {
    const t = jfTarget(conn);
    return { url: JF.streamUrl(t, track.remoteId), headers: JF.jellyfinHeaders(t.token) };
  }
  const t = absTarget(conn);
  return { url: ABS.streamUrl(t, item.remoteId, track.remoteId), headers: ABS.absHeaders(t.token) };
}

/** Opens one file of a shelf item, passing the player's Range on so it can seek. */
export async function openTrack(db: Tx, itemId: string, index: number, range: string | null, signal?: AbortSignal) {
  const src = await trackSource(db, itemId, index);
  return openUpstream(src.url, { ...src.headers, ...(range ? { Range: range } : {}), Accept: "audio/*,*/*;q=0.5" }, { signal });
}

/** Opens a shelf item's cover. */
export async function openCover(db: Tx, itemId: string, signal?: AbortSignal) {
  const { conn, item } = await itemOf(db, itemId);
  if (conn.kind === "jellyfin") {
    const t = jfTarget(conn);
    return openUpstream(JF.coverUrl(t, item.remoteId), { ...JF.jellyfinHeaders(t.token), Accept: "image/*" }, { signal });
  }
  const t = absTarget(conn);
  return openUpstream(ABS.coverUrl(t, item.remoteId), { ...ABS.absHeaders(t.token), Accept: "image/*" }, { signal });
}

// ── Speakers (Home Assistant) ────────────────────────────────────────────────
/** How long a speaker may fetch the file it was given: long enough for the longest audiobook chapter. */
const CAST_TTL_MS = 12 * 60 * 60_000;
/** Home Assistant's feature bits for media players. */
const SEEK = 2, MEDIA_ENQUEUE = 2_097_152;

/** The signed address a speaker fetches one file at. */
export const castPath = (itemId: string, index: number) => `/api/media/cast/${sign(`${itemId}-${index}`, CAST_TTL_MS)}`;

/** What a signed speaker address stands for, or null when it is forged or ran out. */
export function readCast(token: string): { itemId: string; index: number } | null {
  const v = verify(token);
  const m = v?.match(/^([a-z0-9]{6,24})-(\d{1,4})$/);
  return m ? { itemId: m[1], index: Number(m[2]) } : null;
}

/** Opens a file for a speaker, by its signed address. */
export async function openCast(db: Tx, token: string, range: string | null, signal?: AbortSignal) {
  const c = readCast(token);
  if (!c) throw new UserError("forbidden", "this address ran out");
  return openTrack(db, c.itemId, c.index, range, signal);
}

async function haConn(db: Tx) {
  const ha = await db.connection.findFirst({ where: { kind: "homeassistant" }, orderBy: { createdAt: "desc" } });
  if (!ha) throw notFound("Home Assistant");
  return { ha, cfg: haConfig(ha), speakers: speakersOf(ha) };
}

async function speakerOf(db: Tx, entityId: string) {
  const h = await haConn(db);
  const speaker = h.speakers.find((s) => s.entityId === entityId);
  if (!speaker) throw notFound("speaker");
  return { ...h, speaker };
}

/** Home Assistant's media players, for the admin to pick speakers from. */
export async function listSpeakerChoices(db: Tx, input: In<"byId">) {
  const ha = await db.connection.findUnique({ where: { id: input.id } });
  if (!ha || ha.kind !== "homeassistant") throw notFound("connection");
  const cfg = haConfig(ha);
  const all = await listStates(cfg.url, cfg.token);
  return all.filter((s) => isMediaPlayer(s.entity_id)).map((s) => ({ entityId: s.entity_id, name: s.attributes.friendly_name || s.entity_id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Saves which speakers the shelf may play on, and how loud. */
export async function saveSpeakers(db: Tx, input: In<"speakers">) {
  const ha = await db.connection.findUnique({ where: { id: input.id } });
  if (!ha || ha.kind !== "homeassistant") throw notFound("connection");
  await db.connection.update({ where: { id: ha.id }, data: { config: json({ ...(ha.config as HaStoredConfig), speakers: input.speakers } satisfies HaStoredConfig) } });
}

/**
 * What a speaker says it plays. Many name the address they were given: one of
 * Kindo's own is shown as the shelf item's name, never as the signed address.
 */
async function titleOf(db: Tx, title: string | undefined): Promise<string | undefined> {
  if (!title) return undefined;
  const signed = /\/api\/media\/cast\/([A-Za-z0-9_.-]+)/.exec(title);
  if (!signed) return title;
  const cast = readCast(signed[1]);
  return cast ? (await itemOf(db, cast.itemId).catch(() => null))?.item.name : undefined;
}

/** The speakers right now: playing or not, what, and how loud. */
export async function readSpeakers(db: Tx): Promise<SpeakerState[]> {
  const ha = await db.connection.findFirst({ where: { kind: "homeassistant" }, orderBy: { createdAt: "desc" } });
  const speakers = speakersOf(ha);
  if (!ha || !speakers.length) return [];
  const cfg = haConfig(ha);
  return Promise.all(speakers.map(async (s): Promise<SpeakerState> => {
    try {
      const st = await readState(cfg.url, cfg.token, s.entityId) as Awaited<ReturnType<typeof readState>> & { attributes: { media_title?: string; volume_level?: number } };
      const v = st.attributes.volume_level;
      return { entityId: s.entityId, name: s.name, maxVolume: s.maxVolume, state: speakerStateOf(st.state), title: await titleOf(db, st.attributes.media_title), volume: typeof v === "number" ? Math.round(v * 100) : undefined };
    } catch {
      return { entityId: s.entityId, name: s.name, maxVolume: s.maxVolume, state: "unavailable" };
    }
  }));
}

/**
 * Plays a shelf item on a speaker: Kindo hands Home Assistant a signed
 * address per file. Speakers that can queue get the whole item; others get
 * the file to start with. An audiobook starts at the child's place where the
 * speaker can seek, else at the start of that file. A speaker louder than the
 * admin allows is turned down first.
 */
export async function castToSpeaker(db: Tx, input: In<"cast">, base: string) {
  const { cfg, speaker } = await speakerOf(db, input.speaker);
  const q = await queue(db, { itemId: input.itemId, memberId: input.memberId });
  const st = await readState(cfg.url, cfg.token, speaker.entityId) as Awaited<ReturnType<typeof readState>> & { attributes: { supported_features?: number; volume_level?: number } };
  const features = st.attributes.supported_features ?? 0;
  const vol = st.attributes.volume_level;
  if (typeof vol === "number" && vol * 100 > speaker.maxVolume) {
    await callService(cfg.url, cfg.token, "media_player", "volume_set", { entity_id: speaker.entityId, volume_level: speaker.maxVolume / 100 });
  }
  const { index, offset } = trackAt(q.tracks, q.position);
  const url = (i: number) => `${base.replace(/\/+$/, "")}${castPath(q.itemId, i)}`;
  const play = (i: number, enqueue?: "replace" | "add") => callService(cfg.url, cfg.token, "media_player", "play_media", {
    entity_id: speaker.entityId, media_content_id: url(i), media_content_type: "music", ...(enqueue ? { enqueue } : {}),
  });
  const queues = (features & MEDIA_ENQUEUE) !== 0;
  await play(index, queues ? "replace" : undefined);
  if (queues) for (let i = index + 1; i < q.tracks.length; i++) await play(i, "add");
  if (offset > 5 && (features & SEEK) !== 0) {
    // The speaker needs a moment to start before it can seek.
    setTimeout(() => void callService(cfg.url, cfg.token, "media_player", "media_seek", { entity_id: speaker.entityId, seek_position: Math.floor(offset) })
      .catch((e) => log.warn("speaker seek failed", { error: errorMessage(e) })), 2_000).unref?.();
  }
  return { queued: queues ? q.tracks.length - index : 1 };
}

/** Play, pause, stop and volume on one of the admin's speakers; nothing else. */
export async function speakerCommand(db: Tx, input: In<"speaker">) {
  const { cfg, speaker } = await speakerOf(db, input.speaker);
  const target = { entity_id: speaker.entityId };
  if (input.command === "volume") {
    if (input.volume === undefined) throw new UserError("invalid", "a volume");
    return callService(cfg.url, cfg.token, "media_player", "volume_set", { ...target, volume_level: clampVolume(input.volume, speaker.maxVolume) / 100 });
  }
  const service = { play: "media_play", pause: "media_pause", stop: "media_stop" }[input.command];
  await callService(cfg.url, cfg.token, "media_player", service, target);
}
