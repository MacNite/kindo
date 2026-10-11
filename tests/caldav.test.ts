import { readFileSync } from "node:fs";
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

  it("reads events made elsewhere: the calendar's people by default, which occurrence of a series each is", async () => {
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
    expect(yoga.map((e) => e.recurrenceId)).toEqual(yoga.map((e) => e.start));
    // Never the whole series by default: Kindo must be told how much of it (D69).
    await expect(deleteEvent(db, { id: yoga[0].id })).rejects.toMatchObject({ code: "invalid" });
    expect((await db.connection.findUniqueOrThrow({ where: { id: connectionId } })).status).toBe("ok");
  });

  describe("recurring series (D69)", () => {
    // Swimming: Wednesdays 16:30–17:30 Berlin time for 30 weeks from next Wednesday, so the
    // series always crosses a change of daylight saving. The third one is cancelled.
    const fixture = readFileSync(new URL("./fixtures/school.ics", import.meta.url), "utf8");
    const vtimezone = fixture.slice(fixture.indexOf("BEGIN:VTIMEZONE"), fixture.indexOf("END:VTIMEZONE") + "END:VTIMEZONE".length);
    const first = new Date();
    first.setDate(first.getDate() + ((3 - first.getDay() + 7) % 7 || 7));
    first.setHours(16, 30, 0, 0);
    const weeks = (n: number) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7 * n, 16, 30);
    const local = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
    const objectUrl = (href: string) => (href.startsWith("http") ? href : new URL(href, URL_).toString());
    const read = async (href: string) => (await fetch(objectUrl(href), { headers: auth })).text();
    const put = (name: string, lines: string[]) => fetch(`${calendarUrl.replace(/\/$/, "")}/${name}`, {
      method: "PUT", headers: { ...auth, "Content-Type": "text/calendar" },
      body: ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", vtimezone, "BEGIN:VEVENT", "UID:swim@elsewhere", "DTSTAMP:20260101T000000Z",
        `DTSTART;TZID=Europe/Berlin:${local(weeks(0))}`, "DURATION:PT1H", "RRULE:FREQ=WEEKLY;COUNT=30", `EXDATE;TZID=Europe/Berlin:${local(weeks(2))}`,
        "DESCRIPTION:Bring towels", ...lines, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n"),
    });
    const swims = async () => (await db.event.findMany({ where: { sourceId }, orderBy: { start: "asc" } })).filter((e) => String(e.title).startsWith("Swim"));
    const as = (e: Awaited<ReturnType<typeof swims>>[number], patch: Partial<{ title: string; start: Date; end: Date; memberIds: string[] }> = {}) =>
      ({ id: e.id, sourceId, title: e.title as string, start: e.start, end: e.end, allDay: false, memberIds: e.memberIds, ...patch });
    const sync = async () => syncConnection(db, await db.connection.findUniqueOrThrow({ where: { id: connectionId } }), { force: true });
    /** Removes the swimming objects from the server, so another run starts clean. */
    const clear = async () => {
      await sync();
      for (const href of new Set((await swims()).map((e) => e.href!))) await fetch(objectUrl(href), { method: "DELETE", headers: auth });
      await sync();
    };
    afterAll(() => clear());

    it("changes one occurrence at the server: the rest of the series, its cancellation and details stay", async () => {
      await clear();
      expect((await put("swim.ics", ["SUMMARY:Swimming"])).ok).toBe(true);
      await sync();
      const before = await swims();
      expect(before).toHaveLength(29);
      const id = await saveEvent(db, { ...as(before[4], { title: "Swimming (Max only)", memberIds: ["max"] }), scope: "occurrence" });
      const after = await swims();
      expect(after).toHaveLength(29);
      expect(after.find((e) => e.id === id)).toMatchObject({ title: "Swimming (Max only)", memberIds: ["max"], recurrenceId: before[4].start });
      expect(after.filter((e) => e.title === "Swimming")).toHaveLength(28);
      const ics = await read(after[0].href!);
      expect(ics).toContain(`RECURRENCE-ID;TZID=Europe/Berlin:${local(weeks(5))}`);
      expect(ics).toContain(`EXDATE;TZID=Europe/Berlin:${local(weeks(2))}`);
      expect(ics.match(/DESCRIPTION:Bring towels/g)).toHaveLength(2);
    });

    it("cancels one occurrence with an EXDATE, the series stays", async () => {
      const before = await swims();
      await deleteEvent(db, { id: before[5].id, scope: "occurrence" });
      const after = await swims();
      expect(after).toHaveLength(28);
      expect(after.some((e) => e.start.getTime() === before[5].start.getTime())).toBe(false);
      expect(await read(after[0].href!)).toContain(`EXDATE;TZID=Europe/Berlin:${local(weeks(6))}`);
    });

    it("moves the whole series to a new time of day on both sides of a daylight-saving change", async () => {
      const before = await swims();
      // Edited on an occurrence in the other half of the year than the first.
      const other = before.find((e) => e.start.getTimezoneOffset() !== before[0].start.getTimezoneOffset())!;
      expect(other).toBeDefined();
      const start = new Date(other.start); start.setHours(17, 0);
      const end = new Date(other.start); end.setHours(18, 0);
      await saveEvent(db, { ...as(other, { start, end }), scope: "series" });
      const after = await swims();
      expect(after).toHaveLength(28);
      expect(after.every((e) => e.start.getHours() === 17 && e.start.getMinutes() === 0)).toBe(true);
      // The exception keeps its own name and people; the cancellations stay cancelled.
      expect(after.find((e) => e.title === "Swimming (Max only)")).toMatchObject({ memberIds: ["max"] });
      const ics = await read(after[0].href!);
      expect(ics).toContain(`EXDATE;TZID=Europe/Berlin:${local(weeks(2)).replace("T1630", "T1700")}`);
      expect(ics).toContain(`RECURRENCE-ID;TZID=Europe/Berlin:${local(weeks(5)).replace("T1630", "T1700")}`);
    });

    it("splits at this and following into a second series: nothing doubled, nothing lost", async () => {
      const before = await swims();
      await saveEvent(db, { ...as(before[10], { title: "Swimming (new pool)" }), scope: "following" });
      const after = await swims();
      expect(after).toHaveLength(28);
      expect(after.slice(0, 10).every((e) => !String(e.title).includes("new pool"))).toBe(true);
      expect(after.slice(10).every((e) => e.title === "Swimming (new pool)")).toBe(true);
      expect(new Set(after.map((e) => e.href)).size).toBe(2);
      expect(after[10].uid).toMatch(/@kindo$/);
      // Cancelling the rest of the new series from its fourth on ends it there.
      await deleteEvent(db, { id: after[13].id, scope: "following" });
      expect(await swims()).toHaveLength(13);
    });

    it("writes nothing when the series changed elsewhere since the last sync, and shows the newer version", async () => {
      // Another app renames the series; Kindo hasn't synced since.
      const renameElsewhere = async (href: string, from: string, to: string) => {
        const text = await read(href);
        expect(text).toContain(`SUMMARY:${from}\r\n`);
        const r = await fetch(objectUrl(href), { method: "PUT", headers: { ...auth, "Content-Type": "text/calendar" }, body: text.replace(`SUMMARY:${from}\r\n`, `SUMMARY:${to}\r\n`) });
        expect(r.ok).toBe(true);
      };
      const [original] = await swims();
      await renameElsewhere(original.href!, "Swimming", "Swimming (changed elsewhere)");
      await expect(saveEvent(db, { ...as(original, { title: "Swimming (Kindo)" }), scope: "following" })).rejects.toMatchObject({ code: "changedElsewhere" });
      let after = await swims();
      expect(after).toHaveLength(13);
      expect(after[0].title).toBe("Swimming (changed elsewhere)");
      expect(after.some((e) => e.title === "Swimming (Kindo)")).toBe(false);
      // No new series was left behind.
      expect(new Set(after.map((e) => e.href)).size).toBe(2);

      // Deleting is refused the same way, and deletes nothing.
      await renameElsewhere(original.href!, "Swimming (changed elsewhere)", "Swimming (changed again)");
      await expect(deleteEvent(db, { id: after[0].id, scope: "series" })).rejects.toMatchObject({ code: "changedElsewhere" });
      after = await swims();
      expect(after).toHaveLength(13);
      expect(after[0].title).toBe("Swimming (changed again)");

      // With the newer version in view, deleting the whole series works and leaves the split-off one.
      await deleteEvent(db, { id: after[0].id, scope: "series" });
      expect((await swims()).every((e) => e.title === "Swimming (new pool)")).toBe(true);
    });
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
