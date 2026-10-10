import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import * as C from "@/server/connections";
import { saveEvent, deleteEvent } from "@/server/household";
import { dueConnections, syncConnection, syncHold } from "@/server/calendar/sync";
import { encryptSecret } from "@/server/crypto";
import { seedDemo } from "@/server/demo/seed";
import { TEST_DB, resetTestDatabase } from "./db";

/**
 * Against a real CalDAV server (Radicale in CI, Nextcloud works the same):
 * CALDAV_TEST_URL, CALDAV_TEST_USER, CALDAV_TEST_PASSWORD, and an existing
 * calendar for that user.
 */
const URL_ = process.env.CALDAV_TEST_URL;
const USER = process.env.CALDAV_TEST_USER ?? "anna";
const PASS = process.env.CALDAV_TEST_PASSWORD ?? "app-password";
const auth = { Authorization: `Basic ${Buffer.from(`${USER}:${PASS}`).toString("base64")}` };

describe.skipIf(!TEST_DB || !URL_)("Nextcloud / CalDAV (§19.5)", () => {
  let db: PrismaClient;
  let connectionId = "";
  let sourceId = "";
  let calendarUrl = "";

  beforeAll(async () => {
    db = await resetTestDatabase();
    await db.$transaction((tx) => seedDemo(tx), { timeout: 60_000 });
  }, 60_000);
  afterAll(() => db?.$disconnect());

  it("refuses a wrong app password before saving anything", async () => {
    await expect(C.addCalDav(db, { url: URL_!, username: USER, password: "wrong" })).rejects.toMatchObject({ code: "remote" });
    expect(await db.connection.count()).toBe(0);
  });

  it("connects, discovers the calendars and keeps the password encrypted", async () => {
    connectionId = await C.addCalDav(db, { url: URL_!, username: USER, password: PASS });
    const conn = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(conn.secret).not.toContain(PASS);
    const sources = await db.calendarSource.findMany({ where: { connectionId } });
    expect(sources.length).toBeGreaterThan(0);
    sourceId = sources[0].id;
    calendarUrl = sources[0].remoteId!;
    await C.updateSource(db, { id: sourceId, name: "Family", defaultMemberIds: ["anna"], readOnly: false, background: false });
  });

  it("writes an event to the server and pulls it back with its people", async () => {
    const start = new Date(Date.now() + 2 * 86_400_000);
    start.setHours(15, 0, 0, 0);
    const id = await saveEvent(db, { sourceId, title: "Swimming", start, end: new Date(start.getTime() + 3_600_000), allDay: false, memberIds: ["paul", "max"], location: "Hallenbad" });
    const row = await db.event.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ title: "Swimming", memberIds: ["paul", "max"], location: "Hallenbad", recurring: false });
    expect(row.href).toContain(calendarUrl.replace(/^https?:\/\/[^/]+/, ""));
    const ics = await (await fetch(row.href!.startsWith("http") ? row.href! : new URL(row.href!, URL_).toString(), { headers: auth })).text();
    expect(ics).toContain("SUMMARY:Swimming");
    expect(ics).toContain("X-KINDO-MEMBERS:paul max");

    // Editing keeps the same event; deleting removes it on the server too.
    await saveEvent(db, { id, sourceId, title: "Swimming lesson", start, end: new Date(start.getTime() + 3_600_000), allDay: false, memberIds: ["paul"] });
    expect(await db.event.findUniqueOrThrow({ where: { id } })).toMatchObject({ title: "Swimming lesson", memberIds: ["paul"] });
    await deleteEvent(db, { id });
    expect(await db.event.count({ where: { id } })).toBe(0);
  });

  it("reads events made elsewhere: the calendar's people by default, recurring series read-only", async () => {
    const d = new Date(Date.now() + 86_400_000);
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", "BEGIN:VEVENT", "UID:yoga@elsewhere", `DTSTAMP:${ymd}T000000Z`,
      `DTSTART:${ymd}T180000Z`, `DTEND:${ymd}T190000Z`, "RRULE:FREQ=WEEKLY;COUNT=4", "SUMMARY:Yoga", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
    const put = await fetch(`${calendarUrl.replace(/\/$/, "")}/yoga.ics`, { method: "PUT", headers: { ...auth, "Content-Type": "text/calendar" }, body });
    expect(put.ok).toBe(true);
    const conn = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
    await syncConnection(db, conn, { force: true });
    const yoga = await db.event.findMany({ where: { sourceId, title: { equals: "Yoga" } }, orderBy: { start: "asc" } });
    expect(yoga).toHaveLength(4);
    expect(yoga.every((e) => e.recurring && e.memberIds.join() === "anna")).toBe(true);
    await expect(deleteEvent(db, { id: yoga[0].id })).rejects.toMatchObject({ code: "readOnly" });
    expect((await db.connection.findUniqueOrThrow({ where: { id: connectionId } })).status).toBe("ok");
  });

  it("two syncs of the same calendar at once don't trip over each other", async () => {
    // Connecting in Settings syncs, and the background job may pick the new connection up at the same moment.
    const conn = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
    const before = await db.event.count({ where: { sourceId } });
    await Promise.all(Array.from({ length: 4 }, () => syncConnection(db, conn, { force: true })));
    expect(await db.event.count({ where: { sourceId } })).toBe(before);
  });

  it("a calendar removed from Kindo stays removed after the next discovery", async () => {
    await C.removeSource(db, { id: sourceId });
    await C.syncNow(db, { id: connectionId });
    expect(await db.calendarSource.count({ where: { remoteId: calendarUrl } })).toBe(0);
  });

  it("stops the background sync after a refused login, until Sync now works again (D60)", async () => {
    const now = new Date();
    const conn = await db.connection.update({ where: { id: connectionId }, data: { secret: encryptSecret("wrong") } });
    await expect(syncConnection(db, conn, { now })).rejects.toMatchObject({ status: 401 });
    const refused = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(refused.status).toBe("error");
    expect(refused.lastError).toContain("wrong username or app password");
    expect(syncHold(refused)).toMatchObject({ stopped: true, failures: 1 });
    // Not even hours later: the same wrong password would only get the household's IP blocked.
    expect((await dueConnections(db, new Date(now.getTime() + 6 * 3_600_000))).map((c) => c.id)).not.toContain(connectionId);

    await db.connection.update({ where: { id: connectionId }, data: { secret: encryptSecret(PASS) } });
    await C.syncNow(db, { id: connectionId });
    const fixed = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(fixed.status).toBe("ok");
    expect(syncHold(fixed)).toBeUndefined();
    expect((await dueConnections(db, new Date(Date.now() + 6 * 60_000))).map((c) => c.id)).toContain(connectionId);
  });

  it("waits longer after each failure in a row, at most an hour", async () => {
    const at = new Date();
    const down = await db.connection.create({ data: { kind: "caldav", name: "down", url: "http://127.0.0.1:1/", username: USER, secret: encryptSecret(PASS) } });
    const due = async (minutes: number) => (await dueConnections(db, new Date(at.getTime() + minutes * 60_000))).some((c) => c.id === down.id);
    expect(await due(0)).toBe(true);
    await expect(syncConnection(db, down, { now: at })).rejects.toThrow();
    expect(await due(4)).toBe(false);
    expect(await due(5)).toBe(true);
    await db.connection.update({ where: { id: down.id }, data: { config: { sync: { failures: 5 } } } });
    expect(await due(31)).toBe(false);
    expect(await due(32)).toBe(true);
    await db.connection.update({ where: { id: down.id }, data: { config: { sync: { failures: 12 } } } });
    expect(await due(59)).toBe(false);
    expect(await due(60)).toBe(true);
    // A server that asked to wait (429 with Retry-After) is left alone until then.
    await db.connection.update({ where: { id: down.id }, data: { config: { sync: { failures: 1, until: new Date(at.getTime() + 90 * 60_000).toISOString() } } } });
    expect(await due(89)).toBe(false);
    expect(await due(90)).toBe(true);
    await db.connection.delete({ where: { id: down.id } });
  });
});
