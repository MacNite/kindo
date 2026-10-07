import { z } from "zod";
import type { Connection, Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { encryptSecret } from "./crypto";
import { UserError, notFound } from "./errors";
import { id } from "./validation";
import { providerFor, syncConnection } from "./calendar/sync";
import { listCalendars } from "./calendar/caldav";

/**
 * Connections to outside services and the calendars they bring (§5, §15,
 * §19.5). Admin only. Secrets are encrypted before they touch the database
 * and never come back out to a device (§17).
 */
const httpUrl = z.string().trim().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "http(s) only");
export const C = {
  addCalDav: z.object({ name: z.string().trim().max(60).optional(), url: httpUrl, username: z.string().trim().min(1).max(200), password: z.string().min(1).max(500) }),
  source: z.object({
    id,
    name: z.string().trim().min(1).max(80),
    defaultMemberIds: z.array(id).max(20),
    readOnly: z.boolean(),
    background: z.boolean(),
  }),
  byId: z.object({ id }),
};
type In<K extends keyof typeof C> = z.output<(typeof C)[K]>;
const json = (v: unknown) => v as Prisma.InputJsonValue;

interface Config { ignored?: string[] }

/** Adds the calendars a connection has that Kindo doesn't know yet (and that nobody removed). */
export async function discoverCalendars(db: Tx, conn: Connection) {
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
  await discoverCalendars(db, conn);
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
  await db.connection.deleteMany({ where: { id: input.id } });
}

/** "Sync now": new calendars first, then every calendar regardless of its change marker. */
export async function syncNow(db: Tx, input: In<"byId">) {
  const conn = await db.connection.findUnique({ where: { id: input.id } });
  if (!conn) throw notFound("connection");
  await discoverCalendars(db, conn);
  await syncConnection(db, conn, { force: true });
}
