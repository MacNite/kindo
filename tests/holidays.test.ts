import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { syncHolidays, holidaysDue } from "@/server/holidays";
import { setHolidayFeeds, setCompletion } from "@/server/household";
import { loadSnapshot } from "@/server/snapshot";
import { seedDemo } from "@/server/demo/seed";
import { TEST_DB, VIEWER, resetTestDatabase } from "./db";

const ics = readFileSync(new URL("./fixtures/school.ics", import.meta.url), "utf8");

describe.skipIf(!TEST_DB)("school holidays (§7, §19.3)", () => {
  let db: PrismaClient;
  let server: Server;
  let base = "";
  let fail = false;

  beforeAll(async () => {
    db = await resetTestDatabase();
    await db.$transaction((tx) => seedDemo(tx, new Date(2026, 9, 7, 9), "Europe/Berlin"), { timeout: 60_000 });
    server = createServer((req, res) => {
      if (fail) {
        res.writeHead(500).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/calendar" }).end(ics);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);
  afterAll(async () => {
    server?.close();
    await db?.$disconnect();
  });

  it("fetches the feeds and stores the holidays as date ranges", async () => {
    await setHolidayFeeds(db, { urls: [`${base}/ferien.ics`] });
    const now = new Date(2026, 9, 7);
    expect(await holidaysDue(db, now)).toBe(true);
    const n = await syncHolidays(db, now);
    expect(n).toBeGreaterThanOrEqual(3);
    expect(await db.holidayRange.findFirst({ where: { summary: "Herbstferien" } })).toMatchObject({ start: "2026-10-26", end: "2026-10-30" });
    // Due-ness is judged against the same clock the sync ran on, not today's.
    expect(await holidaysDue(db, now)).toBe(false);
    const snap = await loadSnapshot(db, VIEWER, now);
    expect(snap?.holidays.map((h) => h.summary)).toContain("Herbstferien");
  });

  it("keeps the previous holidays when a feed fails, and records why", async () => {
    fail = true;
    await expect(syncHolidays(db, new Date(2026, 9, 8))).rejects.toThrow();
    fail = false;
    expect(await db.holidayRange.count()).toBeGreaterThanOrEqual(3);
    expect((await db.household.findUniqueOrThrow({ where: { id: 1 } })).holidaysError).toMatch(/HTTP 500/);
  });

  it("backs off after failures instead of retrying every minute, and is fresh again once it worked", async () => {
    const failed = new Date(2026, 9, 8); // the failure above
    const at = (minutes: number) => new Date(failed.getTime() + minutes * 60_000);
    expect(await holidaysDue(db, at(1))).toBe(false);
    expect(await holidaysDue(db, at(2))).toBe(true);
    fail = true;
    await expect(syncHolidays(db, at(2))).rejects.toThrow();
    fail = false;
    expect(await holidaysDue(db, at(5))).toBe(false);
    expect(await holidaysDue(db, at(6))).toBe(true);
    await syncHolidays(db, at(6));
    expect(await db.household.findUniqueOrThrow({ where: { id: 1 } })).toMatchObject({ holidaysError: null, holidaysFailures: 0, holidaysFailedAt: null });
    expect(await holidaysDue(db, at(60))).toBe(false);
  });

  it("a sync from Settings and the job at once don't double the holidays", async () => {
    const before = await db.holidayRange.count();
    const now = new Date(2026, 9, 9);
    await Promise.all([syncHolidays(db, now), syncHolidays(db, now), syncHolidays(db, now)]);
    expect(await db.holidayRange.count()).toBe(before);
  });

  it("removing every feed clears the holidays", async () => {
    await setHolidayFeeds(db, { urls: [] });
    expect(await db.holidayRange.count()).toBe(0);
  });

  it("only accepts completions for days near the household's own day", async () => {
    const now = new Date(Date.UTC(2026, 9, 7, 22, 30)); // 00:30 on the 8th in Berlin: still the 7th before the 03:00 reset
    await setCompletion(db, { itemId: "c-table", day: "2026-10-07", done: true }, now);
    await setCompletion(db, { itemId: "c-table", day: "2026-10-01", done: true }, now);
    await expect(setCompletion(db, { itemId: "c-table", day: "2026-10-09", done: true }, now)).rejects.toMatchObject({ code: "invalid" });
    await expect(setCompletion(db, { itemId: "c-table", day: "2026-09-29", done: true }, now)).rejects.toMatchObject({ code: "invalid" });
  });
});
