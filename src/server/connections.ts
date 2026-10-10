import { z } from "zod";
import type { Connection, Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { encryptSecret } from "./crypto";
import { UserError, notFound } from "./errors";
import { id, requiredText } from "./validation";
import { providerFor, syncConnection } from "./calendar/sync";
import { listCalendars } from "./calendar/caldav";
import { listAlbums } from "./photos/immich";
import { syncPhotos } from "./photos/sync";
import { ICS_REMOTE_ID, readFeed } from "./calendar/ics";
import { parseCalendar } from "./calendar/ical";
import { checkToken, readEntity, refreshPresenceWatchers, type HaStoredConfig } from "./homeassistant";
import { listFrigate, frigateTarget } from "./frigate";
import { updateFrigate } from "./cameras";
import { checkMedia, updateMediaConnection } from "./media/media";
import { decryptSecret } from "./crypto";

/**
 * Connections to outside services and the calendars they bring (§5, §15,
 * §19.5). Admin only. Secrets are encrypted before they touch the database
 * and never come back out to a device (§17).
 */
const httpUrl = z.string().trim().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "http(s) only");
export const C = {
  addIcs: z.object({
    name: z.string().trim().min(1).max(60),
    url: z.string().trim().max(2000).refine((u) => /^(https?|webcals?):\/\//i.test(u), "http(s) or webcal"),
    defaultMemberIds: z.array(id).max(20),
    background: z.boolean(),
  }),
  addHomeAssistant: z.object({
    url: httpUrl, token: z.string().trim().min(20).max(1000),
    /** Presence is optional: Home Assistant may be connected for Home control only (§21). */
    entityId: z.union([z.literal(""), z.string().trim().regex(/^[a-z_]+\.[a-z0-9_]+$/, "an entity id like binary_sensor.hallway_motion")]),
  }),
  addImmich: z.object({ name: z.string().trim().min(1).max(60), url: httpUrl, apiKey: z.string().trim().min(10).max(500) }),
  addCalDav: z.object({ name: z.string().trim().max(60).optional(), url: httpUrl, username: z.string().trim().min(1).max(200), password: z.string().min(1).max(500) }),
  source: z.object({
    id,
    name: requiredText,
    defaultMemberIds: z.array(id).max(20),
    readOnly: z.boolean(),
    background: z.boolean(),
  }),
  byId: z.object({ id }),
  /**
   * The cog in Settings: a connection's name, address, account or secret.
   * An empty or missing secret keeps the stored one.
   */
  update: z.object({
    id,
    name: z.string().trim().max(60).optional(),
    url: z.string().trim().max(2000).optional(),
    username: z.string().trim().max(200).optional(),
    secret: z.string().max(2000).optional(),
    entityId: z.union([z.literal(""), z.string().trim().regex(/^[a-z_]+\.[a-z0-9_]+$/, "an entity id like binary_sensor.hallway_motion")]).optional(),
    trustCertificate: z.boolean().optional(),
  }),
};
type In<K extends keyof typeof C> = z.output<(typeof C)[K]>;
const json = (v: unknown) => v as Prisma.InputJsonValue;

interface Config { ignored?: string[] }

/**
 * The first read of a connection just added. If it fails, the connection
 * goes again (its calendars and events with it), so trying again doesn't
 * leave a second one behind.
 */
async function firstSync(db: Tx, connectionId: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (e) {
    await db.connection.deleteMany({ where: { id: connectionId } }).catch(() => {});
    throw e;
  }
}

/** Adds the calendars a connection has that Kindo doesn't know yet (and that nobody removed). */
async function discoverCalendars(db: Tx, conn: Connection) {
  const p = providerFor(conn.kind);
  if (!p) return 0;
  const ignored = new Set((conn.config as Config).ignored ?? []);
  const known = new Set((await db.calendarSource.findMany({ where: { connectionId: conn.id }, select: { remoteId: true } })).map((s) => s.remoteId));
  const fresh = (await p.listCalendars(conn)).filter((c) => !known.has(c.remoteId) && !ignored.has(c.remoteId));
  const order = await db.calendarSource.count();
  for (const [i, c] of fresh.entries()) {
    await db.calendarSource.create({
      data: {
        provider: conn.kind === "caldav" ? "caldav" : conn.kind === "google" ? "google" : "ics",
        name: json(c.name), account: conn.url ? new URL(conn.url).host : conn.name, defaultMemberIds: [],
        readOnly: c.readOnly, connectionId: conn.id, remoteId: c.remoteId, sortOrder: order + i,
      },
    });
  }
  return fresh.length;
}

/** Connects a Nextcloud (or other CalDAV) account: checks the app password by listing its calendars first. */
export async function addCalDav(db: Tx, input: In<"addCalDav">) {
  const calendars = await listCalendars({ url: input.url, username: input.username, password: input.password });
  if (!calendars.length) throw new UserError("remote", "no calendars found at this address");
  const conn = await db.connection.create({
    data: {
      kind: "caldav", name: input.name || new URL(input.url).host, url: input.url, username: input.username,
      secret: encryptSecret(input.password), status: "pending",
    },
  });
  await firstSync(db, conn.id, () => discoverCalendars(db, conn));
  return conn.id;
}

/**
 * Subscribes to an ICS feed (§19.8): fetched and parsed once first, so a
 * wrong address fails here rather than in the background.
 */
export async function addIcs(db: Tx, input: In<"addIcs">) {
  const text = await readFeed(input.url).catch((e) => {
    throw e instanceof UserError ? e : new UserError("remote", e instanceof Error ? e.message : String(e));
  });
  parseCalendar(text, { from: new Date(0), to: new Date(0) });
  const host = (() => {
    try {
      return new URL(input.url.replace(/^webcals?:/i, "https:")).host;
    } catch {
      return undefined;
    }
  })();
  const conn = await db.connection.create({ data: { kind: "ics", name: input.name, secret: encryptSecret(input.url), status: "pending" } });
  await db.calendarSource.create({
    data: {
      provider: "ics", name: json(input.name), account: host, defaultMemberIds: input.defaultMemberIds, readOnly: true,
      background: input.background, connectionId: conn.id, remoteId: ICS_REMOTE_ID, sortOrder: await db.calendarSource.count(),
    },
  });
  await firstSync(db, conn.id, () => syncConnection(db, conn, { force: true }));
  return conn.id;
}

/** Adds a Google account after its consent screen (see /api/integrations/google). */
export async function addGoogle(db: Tx, input: { email: string; refreshToken: string }) {
  const existing = await db.connection.findFirst({ where: { kind: "google", username: input.email } });
  const data = { kind: "google" as const, name: input.email, username: input.email, secret: encryptSecret(input.refreshToken), status: "pending" as const };
  const conn = existing ? await db.connection.update({ where: { id: existing.id }, data }) : await db.connection.create({ data });
  await discoverCalendars(db, conn);
  // The account stays even if its first sync fails (a new sign-in would be needed to get the token back);
  // the connection records the error, and Settings says the events didn't come yet.
  const synced = await syncConnection(db, conn, { force: true }).then(() => true, () => false);
  return { id: conn.id, synced };
}

/**
 * Connects Home Assistant for presence (§19.8) and Home control (§21): checks
 * the token and the presence entity first. One connection per household; a
 * new one keeps the switches, sensors, speakers and voice setup the old one had.
 */
export async function addHomeAssistant(db: Tx, input: In<"addHomeAssistant">) {
  if (input.entityId) await readEntity(input.url, input.token, input.entityId);
  else await checkToken(input.url, input.token);
  const old = (await db.connection.findFirst({ where: { kind: "homeassistant" } }))?.config as HaStoredConfig | undefined;
  await db.connection.deleteMany({ where: { kind: "homeassistant" } });
  const config: HaStoredConfig = { entityId: input.entityId || undefined, controls: old?.controls, energy: old?.energy, speakers: old?.speakers, voice: old?.voice };
  const conn = await db.connection.create({
    data: { kind: "homeassistant", name: input.entityId || new URL(input.url).host, url: input.url, secret: encryptSecret(input.token), config: json(config), status: "pending" },
  });
  await refreshPresenceWatchers();
  return conn.id;
}

/** Connects an Immich server: checks the API key by listing its albums first (§19.6). */
export async function addImmich(db: Tx, input: In<"addImmich">) {
  await listAlbums({ url: input.url, apiKey: input.apiKey });
  const conn = await db.connection.create({
    data: { kind: "immich", name: input.name, url: input.url, secret: encryptSecret(input.apiKey), status: "pending" },
  });
  await firstSync(db, conn.id, () => syncPhotos(db, conn));
  return conn.id;
}

export async function updateSource(db: Tx, input: In<"source">) {
  const s = await db.calendarSource.findUnique({ where: { id: input.id } });
  if (!s) throw notFound("calendar");
  await db.calendarSource.update({
    where: { id: s.id },
    data: { name: json(input.name), defaultMemberIds: input.defaultMemberIds, readOnly: input.readOnly, background: input.background },
  });
  // Colours and background flags live on the stored events: apply them now, not at the next sync.
  await db.event.updateMany({ where: { sourceId: s.id }, data: { background: input.background } });
  const own = await db.event.findMany({ where: { sourceId: s.id }, select: { id: true, memberIds: true } });
  const old = new Set(s.defaultMemberIds);
  for (const e of own) {
    const followsSource = e.memberIds.length === old.size && e.memberIds.every((m) => old.has(m));
    if (followsSource) await db.event.update({ where: { id: e.id }, data: { memberIds: input.defaultMemberIds } });
  }
}

/** Removes a calendar from Kindo (not from its server), and remembers not to add it back. */
export async function removeSource(db: Tx, input: In<"byId">) {
  const s = await db.calendarSource.findUnique({ where: { id: input.id }, include: { connection: true } });
  if (!s) return;
  if (s.provider === "local") throw new UserError("invalid", "Kindo's own calendar stays");
  if (s.connection && s.remoteId) {
    const cfg = s.connection.config as Config;
    await db.connection.update({ where: { id: s.connection.id }, data: { config: json({ ...cfg, ignored: [...new Set([...(cfg.ignored ?? []), s.remoteId])] }) } });
  }
  await db.calendarSource.delete({ where: { id: s.id } });
}

export async function removeConnection(db: Tx, input: In<"byId">) {
  const gone = await db.connection.findUnique({ where: { id: input.id }, select: { kind: true } });
  await db.connection.deleteMany({ where: { id: input.id } });
  // Home Assistant or Frigate gone: the watcher stops (or loses its doorbells) now, not at the next tick.
  if (gone?.kind === "homeassistant" || gone?.kind === "frigate") await refreshPresenceWatchers();
}

/**
 * Changes a connection in place (§15, the cog in Settings): checked against
 * the service first, like adding it, so a typo doesn't break what worked.
 * Its calendars, albums, switches, cameras and shelf stay.
 */
export async function updateConnection(db: Tx, input: In<"update">) {
  const conn = await db.connection.findUnique({ where: { id: input.id } });
  if (!conn) throw notFound("connection");
  const url = input.url ? httpUrl.parse(input.url) : conn.url ?? "";
  const secret = input.secret?.trim() ? input.secret : undefined;
  const stored = () => (conn.secret ? decryptSecret(conn.secret) : "");
  const name = input.name || conn.name;
  const done = { status: "ok" as const, lastError: null, lastSyncAt: new Date() };
  switch (conn.kind) {
    case "caldav": {
      const username = input.username || conn.username || "";
      const password = secret ?? stored();
      const calendars = await listCalendars({ url, username, password });
      if (!calendars.length) throw new UserError("remote", "no calendars found at this address");
      await db.connection.update({ where: { id: conn.id }, data: { name, url, username, secret: encryptSecret(password), ...done } });
      await syncNow(db, { id: conn.id }).catch(() => {});
      return;
    }
    case "ics": {
      if (secret) {
        const text = await readFeed(secret).catch((e) => {
          throw e instanceof UserError ? e : new UserError("remote", e instanceof Error ? e.message : String(e));
        });
        parseCalendar(text, { from: new Date(0), to: new Date(0) });
      }
      await db.connection.update({ where: { id: conn.id }, data: { name, ...(secret ? { secret: encryptSecret(secret.trim()) } : {}) } });
      if (secret) await syncNow(db, { id: conn.id }).catch(() => {});
      return;
    }
    case "google":
      await db.connection.update({ where: { id: conn.id }, data: { name } });
      return;
    case "immich": {
      const apiKey = secret?.trim() ?? stored();
      await listAlbums({ url, apiKey });
      await db.connection.update({ where: { id: conn.id }, data: { name, url, secret: encryptSecret(apiKey), ...done } });
      return;
    }
    case "homeassistant": {
      const token = secret?.trim() ?? stored();
      const entityId = input.entityId ?? ((conn.config as HaStoredConfig).entityId ?? "");
      if (entityId) await readEntity(url, token, entityId);
      else await checkToken(url, token);
      const config: HaStoredConfig = { ...(conn.config as HaStoredConfig), entityId: entityId || undefined };
      await db.connection.update({ where: { id: conn.id }, data: { name: entityId || new URL(url).host, url, secret: encryptSecret(token), config: json(config), ...done } });
      await refreshPresenceWatchers();
      return;
    }
    case "frigate":
      await updateFrigate(db, conn, { url, username: input.username ?? conn.username ?? "", password: secret, trustCertificate: input.trustCertificate ?? false });
      return;
    case "jellyfin":
    case "audiobookshelf":
      await updateMediaConnection(db, conn, { name: input.name, url, username: input.username, secret: secret?.trim() });
      return;
  }
}

/** "Sync now": new calendars first, then every calendar regardless of its change marker. */
export async function syncNow(db: Tx, input: In<"byId">) {
  const conn = await db.connection.findUnique({ where: { id: input.id } });
  if (!conn) throw notFound("connection");
  if (conn.kind === "immich") return syncPhotos(db, conn);
  if (conn.kind === "homeassistant") return refreshPresenceWatchers();
  if (conn.kind === "jellyfin" || conn.kind === "audiobookshelf") return checkMedia(db, conn);
  if (conn.kind === "frigate") {
    // Nothing to sync: check that Frigate still answers and the login still works.
    try {
      await listFrigate(frigateTarget(conn));
      await db.connection.update({ where: { id: conn.id }, data: { status: "ok", lastError: null, lastSyncAt: new Date() } });
    } catch (e) {
      await db.connection.update({ where: { id: conn.id }, data: { status: "error", lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500), lastSyncAt: new Date() } });
      throw e;
    }
    return;
  }
  await discoverCalendars(db, conn);
  await syncConnection(db, conn, { force: true });
}
