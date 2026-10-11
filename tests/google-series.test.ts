import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import * as C from "@/server/connections";
import { saveEvent, deleteEvent } from "@/server/household";
import { syncConnection } from "@/server/calendar/sync";
import { seriesPatch } from "@/server/calendar/google";
import { seedDemo } from "@/server/demo/seed";
import { resetEnvCache } from "@/server/env";
import { TEST_DB, resetTestDatabase } from "./db";

const listen = (s: Server) => new Promise<string>((r) => s.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));
const readBody = (req: import("node:http").IncomingMessage) => new Promise<string>((r) => {
  let d = "";
  req.on("data", (c) => (d += c));
  req.on("end", () => r(d));
});

const CAL = "family@group.calendar.google.com";
type GDate = { date?: string; dateTime?: string; timeZone?: string };
type GEvent = Record<string, unknown> & { id: string; etag: string; summary?: string; start: GDate; end: GDate; status?: string };

/**
 * Google with one recurring series, enough of it to check what Kindo asks
 * for: the series expands into instances (ids `<series>_<original date>`),
 * an instance's PATCH or DELETE becomes an exception, and every write checks
 * If-Match like Google does. The tests run in Europe/Berlin (vitest.config),
 * so local wall-clock dates are Berlin's.
 */
function googleSeriesMock(first: Date, weeks: number) {
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
  let version = 1;
  const master: GEvent = {
    id: "swim", etag: '"m1"', summary: "Swimming", location: "Hallenbad",
    start: { dateTime: local(first), timeZone: "Europe/Berlin" }, end: { dateTime: local(new Date(first.getTime() + 3_600_000)), timeZone: "Europe/Berlin" },
    recurrence: [`RRULE:FREQ=WEEKLY;COUNT=${weeks}`],
  };
  const exceptions = new Map<string, Partial<GEvent>>();
  const log: { method: string; path: string; body?: Record<string, unknown>; ifMatch?: string }[] = [];
  let gone = false;

  const parse = (d: GDate) => new Date(d.dateTime!); // local (Berlin) when it has no offset
  const instances = (): GEvent[] => {
    if (gone) return [];
    const start = parse(master.start), length = parse(master.end).getTime() - start.getTime();
    return Array.from({ length: weeks }, (_, i) => {
      // Weekly by wall-clock time, as Google does in the series' time zone.
      const orig = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * i, start.getHours(), start.getMinutes());
      // By date: a series that moves within its day keeps its exceptions.
      const id = `swim_${local(orig).slice(0, 10).replace(/-/g, "")}`;
      const own = exceptions.get(id) ?? {};
      const s = own.start ? parse(own.start) : orig;
      return {
        id, etag: `"${master.etag}-${own.etag ?? 0}"`, recurringEventId: "swim", originalStartTime: { dateTime: orig.toISOString() },
        summary: master.summary, location: master.location, extendedProperties: master.extendedProperties,
        ...own, start: { dateTime: s.toISOString() }, end: own.end ?? { dateTime: new Date(s.getTime() + length).toISOString() },
      } as GEvent;
    });
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const json = (b: unknown, status = 200) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(b));
    if (url.pathname === "/token") return json({ access_token: "access-1", expires_in: 3600 });
    if (url.pathname === "/calendar/v3/users/me/calendarList") return json({ items: [{ id: CAL, summary: "Family", accessRole: "owner" }] });
    const m = url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (!m) return json({ error: "not found" }, 404);
    const id = m[2] && decodeURIComponent(m[2]);
    const body = req.method === "PATCH" ? JSON.parse(await readBody(req)) : undefined;
    const ifMatch = req.headers["if-match"] as string | undefined;
    if (req.method !== "GET") log.push({ method: req.method!, path: url.pathname, body, ifMatch });
    if (req.method === "GET" && !id) return json({ items: instances().filter((e) => e.status !== "cancelled") });
    if (id === "swim") {
      if (gone) return json({ error: { code: 410 } }, 410);
      if (req.method === "GET") return json(master);
      if (ifMatch && ifMatch !== master.etag) return json({ error: { code: 412, message: "Precondition Failed" } }, 412);
      if (req.method === "DELETE") return void (gone = true, res.writeHead(204).end());
      Object.assign(master, body, { etag: `"m${++version}"` });
      return json(master);
    }
    const instance = instances().find((e) => e.id === id);
    if (!instance) return json({ error: { code: 404 } }, 404);
    if (req.method === "GET") return json(instance);
    if (ifMatch && ifMatch !== instance.etag) return json({ error: { code: 412, message: "Precondition Failed" } }, 412);
    const own = exceptions.get(id!) ?? {};
    if (req.method === "DELETE") exceptions.set(id!, { ...own, status: "cancelled", etag: String(++version) });
    else exceptions.set(id!, { ...own, ...body, etag: String(++version) });
    return req.method === "DELETE" ? res.writeHead(204).end() : json({});
  });

  /** Another app changes one occurrence, unseen by Kindo. */
  const changeElsewhere = (instanceId: string, summary: string) => exceptions.set(instanceId, { ...exceptions.get(instanceId), summary, etag: String(++version) });
  return { server, log, master, exceptions, changeElsewhere };
}

describe("seriesPatch: a whole Google series at a new time of day (D70)", () => {
  // A series at 16:30 Berlin time that began in summer, edited on a winter occurrence.
  const master = { start: { dateTime: "2026-10-07T16:30:00+02:00", timeZone: "Europe/Berlin" }, end: { dateTime: "2026-10-07T17:30:00+02:00", timeZone: "Europe/Berlin" } };
  const row = { title: "Swimming", start: new Date("2026-11-04T15:30:00Z"), end: new Date("2026-11-04T16:30:00Z"), allDay: false, location: null, memberIds: [] };
  const edit = { uid: "", title: "Swimming", allDay: false, memberIds: [] as string[] };

  it("sends the new wall-clock time in the series' zone, not a UTC shift", () => {
    const patch = seriesPatch(master, row, { ...edit, start: new Date("2026-11-04T16:00:00Z"), end: new Date("2026-11-04T17:00:00Z") });
    // 17:00 CET on the edited day is 17:00 in the summer the series began, not 18:00.
    expect(patch).toEqual({ start: { dateTime: "2026-10-07T17:00:00", timeZone: "Europe/Berlin" }, end: { dateTime: "2026-10-07T18:00:00", timeZone: "Europe/Berlin" } });
  });

  it("leaves the times alone when only the title changed", () => {
    expect(seriesPatch(master, row, { ...edit, title: "Swim", start: row.start, end: row.end })).toEqual({ summary: "Swim" });
  });

  it("refuses another day or all-day for the whole series", () => {
    expect(() => seriesPatch(master, row, { ...edit, start: new Date("2026-11-05T15:30:00Z"), end: new Date("2026-11-05T16:30:00Z") })).toThrow(/within their day/);
    expect(() => seriesPatch(master, row, { ...edit, allDay: true, start: new Date("2026-11-04T00:00:00Z"), end: new Date("2026-11-05T00:00:00Z") })).toThrow(/all-day/);
  });
});

describe.skipIf(!TEST_DB)("Google Calendar series (D70)", () => {
  let db: PrismaClient;
  let sourceId = "";
  // Wednesdays at 16:30 from next week for 30 weeks: always across a change of daylight saving.
  const first = new Date();
  first.setDate(first.getDate() + ((3 - first.getDay() + 7) % 7 || 7));
  first.setHours(16, 30, 0, 0);
  const google = googleSeriesMock(first, 30);
  const swims = async () => (await db.event.findMany({ where: { sourceId }, orderBy: { start: "asc" } }));
  const as = (e: Awaited<ReturnType<typeof swims>>[number], patch: Partial<{ title: string; start: Date; end: Date; memberIds: string[] }> = {}) =>
    ({ id: e.id, sourceId, title: e.title as string, start: e.start, end: e.end, allDay: false, memberIds: e.memberIds, location: e.location ?? undefined, ...patch });
  const writes = () => google.log.length;

  beforeAll(async () => {
    db = await resetTestDatabase();
    await db.$transaction((tx) => seedDemo(tx), { timeout: 60_000 });
    const base = await listen(google.server);
    process.env.GOOGLE_API_BASE = base;
    process.env.GOOGLE_OAUTH_BASE = base;
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    resetEnvCache();
    const { id } = await C.addGoogle(db, { email: "max@example.test", refreshToken: "refresh-1" });
    sourceId = (await db.calendarSource.findFirstOrThrow({ where: { connectionId: id } })).id;
  }, 60_000);
  afterAll(async () => {
    google.server.close();
    await db?.$disconnect();
  });

  it("keeps which occurrence each one is, and the series it belongs to", async () => {
    const rows = await swims();
    expect(rows).toHaveLength(30);
    expect(rows.every((e) => e.recurring && e.seriesId === "swim" && e.recurrenceId?.getTime() === e.start.getTime())).toBe(true);
  });

  it("changes one occurrence as Google's exception, with the version Kindo saw", async () => {
    const rows = await swims();
    const id = await saveEvent(db, { ...as(rows[3], { title: "Swimming (Lena)", memberIds: ["lena"] }), scope: "occurrence" });
    const patch = google.log.at(-1)!;
    expect(patch).toMatchObject({ method: "PATCH", path: expect.stringContaining(encodeURIComponent(rows[3].href!)), ifMatch: rows[3].etag });
    expect(patch.body).toEqual({ summary: "Swimming (Lena)", extendedProperties: { private: { kindoMembers: "lena" } } });
    const after = await swims();
    expect(after).toHaveLength(30);
    expect(after.find((e) => e.id === id)).toMatchObject({ title: "Swimming (Lena)", memberIds: ["lena"] });
    expect(after.filter((e) => e.title === "Swimming")).toHaveLength(29);
  });

  it("cancels one occurrence: only it goes", async () => {
    const rows = await swims();
    await deleteEvent(db, { id: rows[4].id, scope: "occurrence" });
    expect(google.log.at(-1)).toMatchObject({ method: "DELETE", path: expect.stringContaining(rows[4].href!), ifMatch: rows[4].etag });
    const after = await swims();
    expect(after).toHaveLength(29);
    expect(after.some((e) => e.id === rows[4].id)).toBe(false);
  });

  it("moves the whole series to a new time of day, the same wall-clock time across daylight saving", async () => {
    const rows = await swims();
    const other = rows.find((e) => e.start.getTimezoneOffset() !== rows[0].start.getTimezoneOffset())!;
    expect(other).toBeDefined();
    const start = new Date(other.start); start.setHours(17, 0);
    const end = new Date(other.start); end.setHours(18, 0);
    await saveEvent(db, { ...as(other, { start, end }), scope: "series" });
    const patch = google.log.at(-1)!;
    expect(patch).toMatchObject({ method: "PATCH", path: expect.stringMatching(/\/events\/swim$/), ifMatch: '"m1"' });
    expect(patch.body).toEqual({ start: { dateTime: expect.stringMatching(/T17:00:00$/), timeZone: "Europe/Berlin" }, end: { dateTime: expect.stringMatching(/T18:00:00$/), timeZone: "Europe/Berlin" } });
    const after = await swims();
    expect(after.filter((e) => e.title === "Swimming").every((e) => e.start.getHours() === 17)).toBe(true);
    // The cancelled one stays cancelled, the changed one keeps its own title.
    expect(after).toHaveLength(29);
    expect(after.find((e) => e.title === "Swimming (Lena)")).toMatchObject({ memberIds: ["lena"] });
  });

  it("offers no \"this and following\" for Google and sends nothing when asked", async () => {
    const rows = await swims();
    const before = writes();
    await expect(saveEvent(db, { ...as(rows[6], { title: "Swim" }), scope: "following" })).rejects.toMatchObject({ code: "readOnly" });
    await expect(deleteEvent(db, { id: rows[6].id, scope: "following" })).rejects.toMatchObject({ code: "readOnly" });
    // Nor anything without saying how much of the series is meant.
    await expect(saveEvent(db, as(rows[6], { title: "Swim" }))).rejects.toMatchObject({ code: "invalid" });
    await expect(deleteEvent(db, { id: rows[6].id })).rejects.toMatchObject({ code: "invalid" });
    expect(writes()).toBe(before);
  });

  it("an occurrence changed in Google meanwhile: nothing is written, the newer version shows", async () => {
    const rows = await swims();
    google.changeElsewhere(rows[7].href!, "Swimming (moved by Oma)");
    const before = writes();
    await expect(saveEvent(db, { ...as(rows[7], { title: "Swimming (Kindo)" }), scope: "occurrence" })).rejects.toMatchObject({ code: "changedElsewhere" });
    // The whole series isn't touched either while that occurrence is out of date.
    google.changeElsewhere(rows[8].href!, "Swimming (moved by Opa)");
    await expect(deleteEvent(db, { id: rows[8].id, scope: "series" })).rejects.toMatchObject({ code: "changedElsewhere" });
    expect(google.log.slice(before).every((l) => l.method === "PATCH" && l.path.includes(rows[7].href!))).toBe(true);
    const after = await swims();
    expect(after).toHaveLength(29);
    expect(after.find((e) => e.id === rows[7].id)?.title).toBe("Swimming (moved by Oma)");
    expect(after.find((e) => e.id === rows[8].id)?.title).toBe("Swimming (moved by Opa)");
  });

  it("deletes the whole series only when asked for exactly that", async () => {
    const rows = await swims();
    await deleteEvent(db, { id: rows[0].id, scope: "series" });
    expect(google.log.at(-1)).toMatchObject({ method: "DELETE", path: expect.stringMatching(/\/events\/swim$/) });
    expect(await swims()).toHaveLength(0);
    // The series is gone at Google: a later sync agrees.
    const conn = await db.connection.findFirstOrThrow({ where: { kind: "google" } });
    await syncConnection(db, conn, { force: true });
    expect(await swims()).toHaveLength(0);
  });
});
