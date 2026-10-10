import { z } from "zod";
import type { Connection, Prisma } from "@prisma/client";
import {
  ENTITY_ID, STREAM_NAME, TALK_LEASE_MS, cameraInfo, looksLikeVisitor, offerSends,
  type CameraChoices, type CameraInfo, type CameraSetup,
} from "@/lib/cameras";
import type { Tx } from "./db";
import { can, type Actor } from "./actor";
import { encryptSecret } from "./crypto";
import { UserError, notFound } from "./errors";
import { id } from "./validation";
import {
  exchangeSdp, forgetToken, frigateCameras, frigateConnection, frigateTarget, listFrigate, probeCertificate, snapshot as frigateSnapshot,
  type FrigateStoredConfig, type FrigateTarget,
} from "./frigate";
import { haConfig, listStates, refreshPresenceWatchers } from "./homeassistant";

/**
 * Cameras and talking back (§22, §20 D48). The admin connects Frigate and
 * picks cameras; every screen may watch and listen; adults (or a wall
 * unlocked with the PIN) may talk, one screen per camera at a time. Devices
 * only ever name a camera by Kindo's id: which go2rtc stream that means is
 * decided here.
 */
const httpUrl = z.string().trim().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "http(s) only");
const streamName = z.string().regex(STREAM_NAME);
const cameraKey = z.string().regex(/^[a-z0-9-]{1,48}$/);
/** A browser's id for itself, so the same person on two screens counts as two speakers. */
const screen = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
export const K = {
  /** No user for Frigate's unauthenticated port (5000) or with Frigate's authentication off. */
  addFrigate: z.object({ url: httpUrl, username: z.string().trim().max(200), password: z.string().max(500), trustCertificate: z.boolean() })
    .refine((x) => Boolean(x.username) === Boolean(x.password), "a user and its password, or neither"),
  setup: z.object({
    id,
    cameras: z.array(z.object({
      id: cameraKey, name: z.string().trim().min(1).max(40), camera: streamName.optional(), stream: streamName, talkStream: streamName.optional(),
      visitorEntity: z.string().regex(ENTITY_ID).refine((e) => e.startsWith("binary_sensor."), "a binary sensor").optional(),
    })).max(12)
      .refine((c) => new Set(c.map((x) => x.id)).size === c.length, "each camera once"),
  }),
  byId: z.object({ id }),
  talk: z.object({ cameraId: cameraKey, screen }),
  sdp: z.object({ cameraId: cameraKey, offer: z.string().min(10).max(32_000).refine((s) => s.startsWith("v=0"), "an SDP offer"), talk: z.boolean(), screen: screen.optional() }),
  none: z.object({}).optional(),
};
type In<Key extends keyof typeof K> = z.output<(typeof K)[Key]>;
const json = (v: unknown) => v as Prisma.InputJsonValue;


/** What every screen may know: the cameras' names and what they can do. */
export const camerasOf = (conn: Pick<Connection, "config"> | null | undefined): CameraInfo[] => frigateCameras(conn).map(cameraInfo);

/**
 * Connects Frigate: checks the address, the certificate and the login by
 * listing its cameras first. One connection per household; a new one keeps
 * the cameras the old one had.
 */
export async function addFrigate(db: Tx, input: In<"addFrigate">) {
  const fingerprint = await frigateLogin(input);
  const old = await db.connection.findMany({ where: { kind: "frigate" } });
  old.forEach((c) => forgetToken(frigateTarget(c)));
  await db.connection.deleteMany({ where: { kind: "frigate" } });
  const config: FrigateStoredConfig = { fingerprint, cameras: frigateCameras(old[0]) };
  const conn = await db.connection.create({
    data: {
      kind: "frigate", name: new URL(input.url).host, url: input.url, username: input.username || null, secret: input.password ? encryptSecret(input.password) : null,
      config: json(config), status: "ok", lastSyncAt: new Date(),
    },
  });
  await refreshPresenceWatchers();
  return conn.id;
}

/** Checks the address, the certificate and the login; the fingerprint to pin, if the admin trusted Frigate's own certificate. */
async function frigateLogin(input: { url: string; username: string; password: string; trustCertificate: boolean }, pinned?: string) {
  let fingerprint: string | undefined;
  if (input.url.toLowerCase().startsWith("https:")) {
    const cert = await probeCertificate(input.url);
    if (!cert.trusted) {
      // The certificate the admin trusted before still counts, as long as it is the same one.
      if (pinned && cert.fingerprint === pinned) fingerprint = pinned;
      else if (!input.trustCertificate) throw new UserError("remote", "Frigate's certificate isn't trusted (self-signed?); turn on \"Trust Frigate's own certificate\"");
      else fingerprint = cert.fingerprint;
    }
  }
  const target: FrigateTarget = { url: input.url, username: input.username, password: input.password, fingerprint };
  await listFrigate(target);
  return fingerprint;
}

/** Changes Frigate's address or login (the cog in Settings). The cameras stay; an empty password keeps the stored one. */
export async function updateFrigate(db: Tx, conn: Connection, input: { url: string; username: string; password?: string; trustCertificate: boolean }) {
  const old = frigateTarget(conn);
  const password = input.password ?? (input.username === old.username ? old.password : "");
  if (Boolean(input.username) !== Boolean(password)) throw new UserError("invalid", "a user and its password, or neither");
  const fingerprint = await frigateLogin({ url: input.url, username: input.username, password, trustCertificate: input.trustCertificate }, old.fingerprint);
  forgetToken(old);
  const cfg = (conn.config ?? {}) as FrigateStoredConfig;
  await db.connection.update({
    where: { id: conn.id },
    data: {
      name: new URL(input.url).host, url: input.url, username: input.username || null, secret: password ? encryptSecret(password) : null,
      config: json({ ...cfg, fingerprint } satisfies FrigateStoredConfig), status: "ok", lastError: null, lastSyncAt: new Date(),
    },
  });
}

async function frigateById(db: Tx, connId: string) {
  const conn = await db.connection.findUnique({ where: { id: connId } });
  if (!conn || conn.kind !== "frigate") throw notFound("connection");
  return conn;
}

/** Records whether Frigate answered, for Settings. */
async function status<T>(db: Tx, conn: Connection, run: () => Promise<T>): Promise<T> {
  try {
    const r = await run();
    if (conn.status !== "ok") await db.connection.update({ where: { id: conn.id }, data: { status: "ok", lastError: null, lastSyncAt: new Date() } });
    return r;
  } catch (e) {
    if (e instanceof UserError && e.code === "remote") {
      await db.connection.update({ where: { id: conn.id }, data: { status: "error", lastError: e.message.slice(0, 500), lastSyncAt: new Date() } }).catch(() => {});
    }
    throw e;
  }
}

/** Frigate's cameras and streams, and Home Assistant's binary sensors, for the admin to pick from. */
export async function listChoices(db: Tx, input: In<"byId">): Promise<CameraChoices> {
  const conn = await frigateById(db, input.id);
  const { cameras, streams } = await status(db, conn, () => listFrigate(frigateTarget(conn)));
  const ha = await db.connection.findFirst({ where: { kind: "homeassistant" }, orderBy: { createdAt: "desc" } });
  let visitors: CameraChoices["visitors"] = [];
  if (ha) {
    const cfg = haConfig(ha);
    const all = await listStates(cfg.url, cfg.token).catch(() => []);
    visitors = all.filter((s) => s.entity_id.startsWith("binary_sensor."))
      .map((s) => ({ entityId: s.entity_id, name: s.attributes.friendly_name || s.entity_id }))
      .sort((a, b) => Number(looksLikeVisitor(b.entityId, b.name)) - Number(looksLikeVisitor(a.entityId, a.name)) || a.name.localeCompare(b.name));
  }
  return { cameras, streams, visitors };
}

/** Saves which cameras the family sees, and which of them ring and talk. */
export async function saveSetup(db: Tx, input: In<"setup">) {
  const conn = await frigateById(db, input.id);
  const cfg = (conn.config ?? {}) as FrigateStoredConfig;
  const cameras: CameraSetup[] = input.cameras.map((c) => ({
    id: c.id, name: c.name, camera: c.camera, stream: c.stream, talkStream: c.talkStream, visitorEntity: c.visitorEntity,
  }));
  await db.connection.update({ where: { id: conn.id }, data: { config: json({ ...cfg, cameras } satisfies FrigateStoredConfig) } });
  // Rings come over Home Assistant's connection: follow the new visitor sensors.
  await refreshPresenceWatchers();
}

async function cameraOf(db: Tx, cameraId: string) {
  const conn = await frigateConnection(db);
  const camera = frigateCameras(conn).find((c) => c.id === cameraId);
  if (!conn || !camera) throw notFound("camera");
  return { conn, camera };
}

// ── One speaker per camera ───────────────────────────────────────────────────
const holderOf = (actor: Actor, screenId: string) => `${actor.kind === "user" ? `user:${actor.userId}` : `device:${actor.deviceId}`}:${screenId}`;

/**
 * Takes or renews the right to talk through a camera for `TALK_LEASE_MS`.
 * Free when nobody holds it or the holder's lease ran out; one statement, so
 * two screens pressing at once can't both win.
 */
export async function takeTalk(db: Tx, input: In<"talk">, actor: Actor, now = new Date()): Promise<{ until: Date }> {
  const { camera } = await cameraOf(db, input.cameraId);
  if (!camera.talkStream) throw new UserError("invalid", "this camera has no speaker");
  const holder = holderOf(actor, input.screen);
  const until = new Date(now.getTime() + TALK_LEASE_MS);
  const won = await db.$queryRaw<{ holder: string }[]>`
    INSERT INTO "TalkLease" ("cameraId", "holder", "until") VALUES (${camera.id}, ${holder}, ${until})
    ON CONFLICT ("cameraId") DO UPDATE SET "holder" = EXCLUDED."holder", "until" = EXCLUDED."until"
    WHERE "TalkLease"."until" < ${now} OR "TalkLease"."holder" = EXCLUDED."holder"
    RETURNING "holder"`;
  if (!won.length) throw new UserError("busy", "someone else is talking");
  return { until };
}

/** Gives the camera back, if this screen holds it. */
export async function releaseTalk(db: Tx, input: In<"talk">, actor: Actor) {
  await db.talkLease.deleteMany({ where: { cameraId: input.cameraId, holder: holderOf(actor, input.screen) } });
}

async function holdsTalk(db: Tx, cameraId: string, actor: Actor, screenId: string, now = new Date()) {
  const lease = await db.talkLease.findUnique({ where: { cameraId } });
  return Boolean(lease && lease.holder === holderOf(actor, screenId) && lease.until > now);
}

// ── Media ────────────────────────────────────────────────────────────────────
/**
 * The WebRTC handshake for one screen. Watching uses the camera's stream and
 * may only receive; talking uses the two-way stream and needs the right to
 * talk and the camera's lease.
 */
export async function answerOffer(db: Tx, input: In<"sdp">, actor: Actor): Promise<string> {
  const { conn, camera } = await cameraOf(db, input.cameraId);
  let stream = camera.stream;
  if (input.talk) {
    if (!can(actor, "manage")) throw new UserError(actor.kind === "device" ? "pin" : "forbidden");
    if (!camera.talkStream) throw new UserError("invalid", "this camera has no speaker");
    if (!input.screen || !(await holdsTalk(db, camera.id, actor, input.screen))) throw new UserError("busy", "take the camera first");
    stream = camera.talkStream;
  } else if (offerSends(input.offer)) {
    throw new UserError("invalid", "watching only receives");
  }
  return status(db, conn, () => exchangeSdp(frigateTarget(conn), stream, input.offer));
}

// Several walls refresh the same picture: one read of Frigate serves them for a moment.
const SNAPSHOT_MS = 2_000;
const g = globalThis as unknown as { kindoSnapshots?: Map<string, { at: number; image: Promise<{ type: string; body: Buffer }> }> };
const snapshots = (g.kindoSnapshots ??= new Map());

/** The camera's latest still picture. */
export async function cameraSnapshot(db: Tx, cameraId: string, height: number, now = Date.now()) {
  const { conn, camera } = await cameraOf(db, cameraId);
  if (!camera.camera) throw notFound("picture");
  const key = `${conn.id}|${camera.camera}|${height}`;
  const hit = snapshots.get(key);
  if (hit && now - hit.at < SNAPSHOT_MS) return hit.image;
  const image = frigateSnapshot(frigateTarget(conn), camera.camera, height);
  snapshots.set(key, { at: now, image });
  image.catch(() => snapshots.delete(key));
  return image;
}
