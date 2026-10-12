import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Connection, Prisma } from "@prisma/client";
import {
  MAX_SHELF, MAX_SPEAKERS, clampVolume, isMediaPlayer, playedToEnd, positionNow, resumeAt, skipTarget, speakerStateOf, startNeedsPin, totalOf, trackAt, withStarts,
  type MediaChoice, type MediaSetup, type MediaSource, type Queue, type ShelfItem, type Speaker, type SpeakerState, type Track,
} from "@/lib/media";
import type { Tx } from "../db";
import { can, type Actor } from "../actor";
import { decryptSecret, encryptSecret, sign, verify } from "../crypto";
import { UserError, notFound } from "../errors";
import { id } from "../validation";
import { callService, haConfig, listStates, type HaConfig, readState, refreshPresenceWatchers, type HaState, type HaStoredConfig } from "../homeassistant";
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
 * signed address that works for one file for a few hours. A speaker that
 * can't queue gets the next file when it played one to the end (D68).
 */
const httpUrl = z.string().trim().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "http(s) only");
const shelfId = z.string().regex(/^[a-z0-9]{6,24}$/);
const speakerId = z.string().trim().regex(/^media_player\.[a-z0-9_]+$/, "a media player").max(255);
export const M = {
  addJellyfin: z.object({ url: httpUrl, username: z.string().trim().min(1).max(200), password: z.string().max(500) }),
  quickConnectStart: z.object({ url: httpUrl }),
  /** A Quick Connect attempt, checked again until the code was entered; with `id`, it signs an existing connection in again. */
  quickConnect: z.object({ attempt: z.string().min(1).max(4000), id: id.optional() }),
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
  tracks: z.object({ itemId: shelfId }),
  progress: z.object({ itemId: shelfId, memberId: id.optional(), position: z.number().min(0).max(1_000_000) }),
  speakers: z.object({
    id,
    speakers: z.array(z.object({ entityId: speakerId, name: z.string().trim().min(1).max(40), maxVolume: z.number().int().min(0).max(100) })).max(MAX_SPEAKERS)
      .refine((s) => new Set(s.map((x) => x.entityId)).size === s.length, "each speaker once"),
  }),
  cast: z.object({ itemId: shelfId, memberId: id.optional(), speaker: speakerId, index: z.number().int().min(0).max(9999).optional() }),
  speaker: z.object({
    speaker: speakerId, command: z.enum(["play", "pause", "stop", "volume", "next", "previous", "track"]),
    volume: z.number().min(0).max(100).optional(), index: z.number().int().min(0).max(9999).optional(),
  }),
  mediaPin: z.object({ mode: z.enum(["off", "speakers", "all"]) }),
  mediaScreen: z.object({ on: z.boolean() }),
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
  return createJellyfin(db, input.url, await JF.signIn(input.url, input.username, input.password));
}

async function createJellyfin(db: Tx, url: string, me: { token: string; userId: string; name: string }) {
  const conn = await db.connection.create({
    data: {
      kind: "jellyfin", name: new URL(url).host, url, username: me.name, secret: encryptSecret(me.token),
      config: json({ userId: me.userId, shelf: [] } satisfies MediaStoredConfig), status: "ok", lastSyncAt: new Date(),
    },
  });
  return conn.id;
}

/** A Jellyfin connection's new address or sign-in. The shelf stays. */
async function storeJellyfin(db: Tx, conn: Connection, url: string, token: string, me: { userId: string; name: string }, name = conn.name) {
  await db.connection.update({
    where: { id: conn.id },
    data: { name, url, username: me.name, secret: encryptSecret(token), config: json({ ...cfgOf(conn), userId: me.userId }), status: "ok", lastError: null, lastSyncAt: new Date() },
  });
  forgetTracks(conn.id);
}

/**
 * Jellyfin's Quick Connect lasts a few minutes; Kindo gives up a little later.
 * The attempt the screen holds is encrypted, so the secret behind the code
 * stays on the server (§17).
 */
const QUICK_CONNECT_MS = 15 * 60_000;

/** Asks Jellyfin for a Quick Connect code (D66): the code to show, and the attempt to check back with. */
export async function quickConnectStart(input: In<"quickConnectStart">) {
  const { secret, code } = await JF.quickConnectStart(input.url);
  return { code, attempt: encryptSecret(JSON.stringify({ url: input.url, secret, at: Date.now() })) };
}

export type QuickConnectResult = { done: false } | { done: true; id: string; name: string; switched: boolean };

/**
 * Checks a Quick Connect attempt. Once the code was entered in Jellyfin it
 * signs in as that user: a new connection, or with `id` the existing one,
 * whose shelf stays even when it is now another user (`switched`).
 */
export async function quickConnect(db: Tx, input: In<"quickConnect">, now = Date.now()): Promise<QuickConnectResult> {
  let a: { url: string; secret: string; at: number };
  try {
    a = JSON.parse(decryptSecret(input.attempt));
  } catch {
    throw new UserError("invalid", "not a Quick Connect attempt");
  }
  if (now - a.at > QUICK_CONNECT_MS) throw new UserError("expired", "the Quick Connect code expired");
  const conn = input.id ? await mediaById(db, input.id) : null;
  if (conn && conn.kind !== "jellyfin") throw new UserError("invalid", "Quick Connect is Jellyfin's");
  if (!(await JF.quickConnectApproved(a.url, a.secret))) return { done: false };
  const me = await JF.quickConnectSignIn(a.url, a.secret);
  if (!conn) return { done: true, id: await createJellyfin(db, a.url, me), name: me.name, switched: false };
  const switched = cfgOf(conn).userId !== me.userId;
  await storeJellyfin(db, conn, a.url, me.token, me);
  return { done: true, id: conn.id, name: me.name, switched };
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
    await storeJellyfin(db, conn, url, token, me, input.name || conn.name);
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
/**
 * Starting playback where the household asked for the PIN (D64): a locked
 * wall is asked for it, a child's own login may not. Only starting is
 * guarded; what plays carries on, and pause, stop and volume stay free.
 */
export async function mayStart(db: Tx, actor: Actor, where: "screen" | "speaker") {
  const h = await db.household.findUnique({ where: { id: 1 }, select: { mediaPin: true, mediaScreen: true } });
  if (can(actor, "manage")) return;
  // With the screen's own playback off, walls and children only play on speakers (D71).
  if (where === "screen" && h?.mediaScreen === false) throw new UserError(actor.kind === "device" ? "pin" : "forbidden", "the shelf plays on speakers only");
  if (!startNeedsPin(h?.mediaPin ?? "off", where)) return;
  throw new UserError(actor.kind === "device" ? "pin" : "forbidden", "starting playback needs the PIN");
}

/** Which starts need the PIN (admin). */
export async function setMediaPin(db: Tx, input: In<"mediaPin">) {
  await db.household.update({ where: { id: 1 }, data: { mediaPin: input.mode } });
}

/** Whether walls and children's own logins may play on the screen itself (admin, D71). */
export async function setMediaScreen(db: Tx, input: In<"mediaScreen">) {
  await db.household.update({ where: { id: 1 }, data: { mediaScreen: input.on } });
}

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

/** A shelf item's files, for its track list: titles and lengths only. */
export async function tracksOf(db: Tx, input: In<"tracks">): Promise<Track[]> {
  const { conn, item } = await itemOf(db, input.itemId);
  return withStarts(await remoteTracks(conn, item));
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
const SEEK = 2, PREVIOUS_TRACK = 16, NEXT_TRACK = 32, MEDIA_ENQUEUE = 2_097_152;
type SpeakerAttributes = HaState["attributes"] & {
  supported_features?: number; volume_level?: number; media_title?: string; media_content_id?: string;
  media_position?: number; media_position_updated_at?: string; media_duration?: number;
};
const speakerState = async (cfg: HaConfig, entityId: string) => await readState(cfg.url, cfg.token, entityId) as HaState & { attributes: SpeakerAttributes };

/** The signed address a speaker fetches one file at. */
export const castPath = (itemId: string, index: number) => `/api/media/cast/${sign(`${itemId}-${index}`, CAST_TTL_MS)}`;

/** One of Kindo's signed speaker addresses, split into Kindo's address and the token. */
const CAST_ADDRESS = /^(https?:\/\/.+?)\/api\/media\/cast\/([A-Za-z0-9_.-]{10,300})$/;

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
  // The speakers are followed for when a file ends (D68).
  await refreshPresenceWatchers();
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
      const st = await speakerState(cfg, s.entityId);
      const v = st.attributes.volume_level;
      // Which of Kindo's files it plays, for the player's track list and skipping.
      const address = CAST_ADDRESS.exec(st.attributes.media_content_id ?? "");
      const cast = address ? readCast(address[2]) : null;
      return {
        entityId: s.entityId, name: s.name, maxVolume: s.maxVolume, state: speakerStateOf(st.state), title: await titleOf(db, st.attributes.media_title),
        ...(cast ? { itemId: cast.itemId, track: cast.index } : {}), volume: typeof v === "number" ? Math.round(v * 100) : undefined,
      };
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
  if (input.index !== undefined && input.index >= q.tracks.length) throw notFound("track");
  const st = await speakerState(cfg, speaker.entityId);
  const features = st.attributes.supported_features ?? 0;
  const vol = st.attributes.volume_level;
  if (typeof vol === "number" && vol * 100 > speaker.maxVolume) {
    await callService(cfg.url, cfg.token, "media_player", "volume_set", { entity_id: speaker.entityId, volume_level: speaker.maxVolume / 100 });
  }
  // A track picked from the list starts at its beginning; otherwise where the child stopped.
  const { index, offset } = input.index !== undefined ? { index: input.index, offset: 0 } : trackAt(q.tracks, q.position);
  const queued = await playFiles(cfg, speaker.entityId, features, base, q.itemId, index, q.tracks.length);
  if (offset > 5 && (features & SEEK) !== 0) {
    // The speaker needs a moment to start before it can seek.
    setTimeout(() => void callService(cfg.url, cfg.token, "media_player", "media_seek", { entity_id: speaker.entityId, seek_position: Math.floor(offset) })
      .catch((e) => log.warn("speaker seek failed", { error: errorMessage(e) })), 2_000).unref?.();
  }
  return { queued };
}

/**
 * Hands a speaker the files of a shelf item from `from` on: all of them where
 * it can queue, else that one (the next follows when it ends, D68). Returns
 * how many it got.
 */
async function playFiles(cfg: HaConfig, entityId: string, features: number, base: string, itemId: string, from: number, count: number) {
  const url = (i: number) => `${base.replace(/\/+$/, "")}${castPath(itemId, i)}`;
  const play = (i: number, enqueue?: "replace" | "add") => callService(cfg.url, cfg.token, "media_player", "play_media", {
    entity_id: entityId, media_content_id: url(i), media_content_type: "music", ...(enqueue ? { enqueue } : {}),
  });
  const queues = (features & MEDIA_ENQUEUE) !== 0;
  await play(from, queues ? "replace" : undefined);
  if (queues) for (let i = from + 1; i < count; i++) await play(i, "add");
  return queues ? count - from : 1;
}

/**
 * Next, Back or a track from the list on a speaker that plays one of Kindo's
 * files: the file it leads to, at the address the speaker used (Back restarts
 * a file that has played a while). A speaker that queued the item skips in
 * its own queue where it can. Something else playing only skips with the
 * speaker's own Next and Back.
 */
async function skipOnSpeaker(db: Tx, cfg: HaConfig, entityId: string, skip: "next" | "previous" | number, mayStart: () => Promise<void>) {
  const st = await speakerState(cfg, entityId);
  const a = st.attributes;
  const playing = speakerStateOf(st.state) === "playing";
  // Skipping on a paused or stopped speaker starts it, which may need the PIN (D64).
  if (!playing) await mayStart();
  const features = a.supported_features ?? 0;
  const own = skip === "next" ? NEXT_TRACK : PREVIOUS_TRACK;
  const address = CAST_ADDRESS.exec(a.media_content_id ?? "");
  const cast = address ? readCast(address[2]) : null;
  if (typeof skip !== "number" && (features & own) !== 0 && (!cast || (features & MEDIA_ENQUEUE) !== 0)) {
    return callService(cfg.url, cfg.token, "media_player", skip === "next" ? "media_next_track" : "media_previous_track", { entity_id: entityId });
  }
  if (!address || !cast) throw new UserError("invalid", "the speaker plays nothing from the shelf");
  const { conn, item } = await itemOf(db, cast.itemId);
  const count = (await remoteTracks(conn, item)).length;
  const reportedAt = a.media_position_updated_at ? Date.parse(a.media_position_updated_at) : undefined;
  const to = skipTarget(skip, cast.index, count, positionNow(a.media_position, reportedAt, Date.now(), playing));
  if (to === null) return;
  await playFiles(cfg, entityId, features, address[1], cast.itemId, to, count);
}

/**
 * A speaker that can't queue stopped playing (D68). When it played one of
 * Kindo's files to the end, and the shelf item has another file after it,
 * Kindo hands it the next one, at the address it used for the last. A stop
 * someone pressed, a speaker that can queue, or one that doesn't say what it
 * played or where it was, stays as it is. Returns the file started, if any.
 */
export async function nextOnSpeaker(db: Tx, from: HaState, stoppedAt: number): Promise<number | null> {
  const ha = await db.connection.findFirst({ where: { kind: "homeassistant" }, orderBy: { createdAt: "desc" } });
  if (!ha || !speakersOf(ha).some((s) => s.entityId === from.entity_id)) return null;
  const a = from.attributes as SpeakerAttributes;
  if (((a.supported_features ?? 0) & MEDIA_ENQUEUE) !== 0) return null;
  const address = CAST_ADDRESS.exec(a.media_content_id ?? "");
  const cast = address && readCast(address[2]);
  if (!address || !cast) return null;
  const { conn, item } = await itemOf(db, cast.itemId);
  const tracks = withStarts(await remoteTracks(conn, item));
  const next = cast.index + 1;
  if (next >= tracks.length) return null;
  const reportedAt = a.media_position_updated_at ? Date.parse(a.media_position_updated_at) : undefined;
  if (!playedToEnd(a.media_position, reportedAt, stoppedAt, tracks[cast.index].duration || a.media_duration || 0)) return null;
  const cfg = haConfig(ha);
  await callService(cfg.url, cfg.token, "media_player", "play_media", {
    entity_id: from.entity_id, media_content_id: `${address[1]}${castPath(cast.itemId, next)}`, media_content_type: "music",
  });
  log.info("speaker plays the next file", { speaker: from.entity_id, file: next });
  return next;
}

/**
 * Play, pause, stop, skipping and volume on one of the admin's speakers;
 * nothing else. `mayStart` guards a skip that starts a speaker which isn't
 * playing (D64).
 */
export async function speakerCommand(db: Tx, input: In<"speaker">, mayStart: () => Promise<void> = async () => {}) {
  const { cfg, speaker } = await speakerOf(db, input.speaker);
  const target = { entity_id: speaker.entityId };
  if (input.command === "next" || input.command === "previous") return skipOnSpeaker(db, cfg, speaker.entityId, input.command, mayStart);
  if (input.command === "track") {
    if (input.index === undefined) throw new UserError("invalid", "a track");
    return skipOnSpeaker(db, cfg, speaker.entityId, input.index, mayStart);
  }
  if (input.command === "volume") {
    if (input.volume === undefined) throw new UserError("invalid", "a volume");
    return callService(cfg.url, cfg.token, "media_player", "volume_set", { ...target, volume_level: clampVolume(input.volume, speaker.maxVolume) / 100 });
  }
  const service = { play: "media_play", pause: "media_pause", stop: "media_stop" }[input.command as "play" | "pause" | "stop"];
  await callService(cfg.url, cfg.token, "media_player", service, target);
}
