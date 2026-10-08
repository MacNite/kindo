import { randomUUID } from "node:crypto";
import type { CalendarSource as SourceRow, Connection, Event as EventRow, Prisma } from "@prisma/client";
import { addDays } from "@/lib/dates";
import { allDayForStorage } from "@/lib/events";
import { inTx, type Tx } from "../db";
import { decryptSecret, sha256 } from "../crypto";
import { UserError, notFound } from "../errors";
import { errorMessage, log } from "../log";
import * as caldav from "./caldav";
import { icsProvider } from "./ics";
import { googleProvider } from "./google";
import type { RemoteCalendar, RemoteEvent } from "./caldav";
import type { EventToWrite } from "./ical";

/**
 * Calendar sync (§5, §19.5, §20 D29). A background job pulls every connected
 * calendar into the Event table, so the wall stays fast and keeps working
 * when Nextcloud is down. Writes go to the server first and are pulled back,
 * so Kindo never shows an event its calendar doesn't have.
 */
export const SYNC_WINDOW = { before: 90, after: 400 };
export const syncMinutes = () => Math.max(1, Number(process.env.KINDO_SYNC_MINUTES ?? 5));
/** Re-read an unchanged calendar now and then anyway: the window moves with the days. */
const FULL_RESYNC_MS = 6 * 3_600_000;

/** What each kind of connection can do. ICS and Google join in §19.8. */
export interface CalendarProvider {
  listCalendars(conn: Connection): Promise<RemoteCalendar[]>;
  fetchEvents(conn: Connection, source: SourceRow, window: { from: Date; to: Date }): Promise<RemoteEvent[]>;
  create?(conn: Connection, source: SourceRow, e: EventToWrite): Promise<void>;
  update?(conn: Connection, source: SourceRow, row: EventRow, e: EventToWrite): Promise<void>;
  remove?(conn: Connection, source: SourceRow, row: EventRow): Promise<void>;
}

export const caldavAccount = (c: Connection): caldav.CalDavAccount => ({ url: c.url ?? "", username: c.username ?? "", password: c.secret ? decryptSecret(c.secret) : "" });

const providers: Partial<Record<Connection["kind"], CalendarProvider>> = {
  caldav: {
    listCalendars: (c) => caldav.listCalendars(caldavAccount(c)),
    fetchEvents: (c, s, w) => caldav.fetchEvents(caldavAccount(c), s.remoteId!, w),
    create: (c, s, e) => caldav.createEvent(caldavAccount(c), s.remoteId!, e),
    update: (c, s, row, e) => caldav.updateEvent(caldavAccount(c), s.remoteId!, row.href!, row.etag ?? undefined, e),
    remove: (c, _s, row) => caldav.deleteEvent(caldavAccount(c), row.href!, row.etag ?? undefined),
  },
  ics: icsProvider,
  google: googleProvider,
};

export function registerCalendarProvider(kind: Connection["kind"], p: CalendarProvider) {
  providers[kind] = p;
}
export const providerFor = (kind: Connection["kind"]) => providers[kind];

/** Same occurrence, same id, sync after sync: screens keep their selection. */
export const eventId = (sourceId: string, uid: string, start: Date) => `ev_${sha256(`${sourceId}|${uid}|${start.toISOString()}`).slice(0, 24)}`;

function toRows(source: SourceRow, events: RemoteEvent[], memberIds: Set<string>): Prisma.EventCreateManyInput[] {
  const seen = new Set<string>();
  const rows: Prisma.EventCreateManyInput[] = [];
  for (const e of events) {
    const id = eventId(source.id, e.uid || e.href, e.start);
    if (seen.has(id)) continue;
    seen.add(id);
    // Kindo's own assignment (X-KINDO-MEMBERS) wins; otherwise the calendar's people (§5).
    const own = e.memberIds?.filter((m) => memberIds.has(m));
    rows.push({
      id, sourceId: source.id, title: e.summary || "", start: e.start, end: e.end, allDay: e.allDay,
      memberIds: own?.length ? own : source.defaultMemberIds, location: e.location ?? null, icon: e.icon ?? null,
      background: source.background, uid: e.uid || null, href: e.href || null, etag: e.etag ?? null, recurring: e.recurring,
    });
  }
  return rows;
}

/** Pulls one calendar. `state` is the calendar's change marker from the listing, when the provider has one. */
export async function syncSource(db: Tx, conn: Connection, source: SourceRow, opts: { state?: string; force?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const p = providerFor(conn.kind);
  if (!p) return false;
  const fresh = source.lastSyncAt && now.getTime() - source.lastSyncAt.getTime() < FULL_RESYNC_MS;
  if (!opts.force && opts.state && source.syncState === opts.state && fresh) return false;
  const window = { from: addDays(now, -SYNC_WINDOW.before), to: addDays(now, SYNC_WINDOW.after) };
  const events = await p.fetchEvents(conn, source, window);
  const members = new Set((await db.member.findMany({ select: { id: true } })).map((m) => m.id));
  const rows = toRows(source, events, members);
  // Replace the calendar's events in one go: screens never see it half synced.
  await inTx(db, async (tx) => {
    // One writer per calendar: a second sync (Settings and the background job at once) waits for the first.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`kindo:sync:${source.id}`}, 0))`;
    await tx.event.deleteMany({ where: { sourceId: source.id } });
    if (rows.length) await tx.event.createMany({ data: rows });
    await tx.calendarSource.update({ where: { id: source.id }, data: { syncState: opts.state ?? null, lastSyncAt: now } });
  });
  return true;
}

/** Syncs every calendar of a connection and records how it went. Returns whether anything changed. */
export async function syncConnection(db: Tx, conn: Connection, opts: { force?: boolean; now?: Date } = {}) {
  const p = providerFor(conn.kind);
  if (!p) return false;
  let changed = false;
  try {
    const sources = await db.calendarSource.findMany({ where: { connectionId: conn.id } });
    const states = new Map((await p.listCalendars(conn)).map((c) => [c.remoteId, c.ctag]));
    for (const s of sources) changed = (await syncSource(db, conn, s, { ...opts, state: states.get(s.remoteId ?? "") })) || changed;
    await db.connection.update({ where: { id: conn.id }, data: { status: "ok", lastError: null, lastSyncAt: opts.now ?? new Date() } });
  } catch (e) {
    await db.connection.update({ where: { id: conn.id }, data: { status: "error", lastError: errorMessage(e).slice(0, 500), lastSyncAt: opts.now ?? new Date() } });
    log.warn("calendar sync failed", { connection: conn.id, kind: conn.kind, error: errorMessage(e) });
    throw e;
  }
  return changed;
}

/** Feeds change rarely and their hosts don't like being polled: at most every half hour. */
const FEED_MINUTES = 30;

/** Connections whose calendars are due for a sync. */
export async function dueConnections(db: Tx, now = new Date()) {
  const before = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
  return db.connection.findMany({
    where: {
      OR: [
        { kind: { in: ["caldav", "google"] }, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: before(syncMinutes()) } }] },
        { kind: "ics", OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: before(Math.max(FEED_MINUTES, syncMinutes())) } }] },
      ],
    },
  });
}

// ── Writing to a connected calendar ─────────────────────────────────────────
export interface EventInput { title: string; start: Date; end: Date; allDay: boolean; memberIds: string[]; location?: string }

async function sourceWithConnection(db: Tx, sourceId: string) {
  const source = await db.calendarSource.findUnique({ where: { id: sourceId }, include: { connection: true } });
  if (!source) throw notFound("calendar");
  if (source.readOnly) throw new UserError("readOnly");
  return source;
}

const toWrite = (uid: string, e: EventInput): EventToWrite => ({ uid, title: e.title, ...allDayForStorage(e), allDay: e.allDay, location: e.location, memberIds: e.memberIds });

/** Creates an event on the calendar's server, then pulls the calendar so the event shows as the server has it. */
export async function createRemoteEvent(db: Tx, sourceId: string, e: EventInput) {
  const source = await sourceWithConnection(db, sourceId);
  const conn = source.connection!;
  const p = providerFor(conn.kind);
  if (!p?.create) throw new UserError("readOnly");
  const uid = `${randomUUID()}@kindo`;
  await p.create(conn, source, toWrite(uid, e));
  await syncSource(db, conn, source, { force: true });
  return syncedId(db, source.id, uid, allDayForStorage(e).start);
}

/**
 * The id of a single event as the sync just stored it. Ids follow the start
 * (see `eventId`), so an event that moved has a new one; looked up by uid in
 * case the server rounded the time.
 */
async function syncedId(db: Tx, sourceId: string, uid: string, start: Date) {
  const row = await db.event.findFirst({ where: { sourceId, uid, recurring: false }, select: { id: true } });
  return row?.id ?? eventId(sourceId, uid, start);
}

/**
 * Single events only: a recurring series is changed in the calendar app that
 * owns it. Returns the event's id afterwards, which changes when it moved.
 */
export async function updateRemoteEvent(db: Tx, row: EventRow, e: EventInput) {
  const source = await sourceWithConnection(db, row.sourceId);
  const conn = source.connection!;
  const p = providerFor(conn.kind);
  if (!p?.update || row.recurring || !row.href) throw new UserError("readOnly");
  await p.update(conn, source, row, toWrite(row.uid ?? `${randomUUID()}@kindo`, e));
  await syncSource(db, conn, source, { force: true });
  return row.uid ? syncedId(db, source.id, row.uid, allDayForStorage(e).start) : eventId(source.id, row.href, allDayForStorage(e).start);
}

export async function deleteRemoteEvent(db: Tx, row: EventRow) {
  const source = await sourceWithConnection(db, row.sourceId);
  const conn = source.connection!;
  const p = providerFor(conn.kind);
  if (!p?.remove || row.recurring || !row.href) throw new UserError("readOnly");
  await p.remove(conn, source, row);
  await syncSource(db, conn, source, { force: true });
}
