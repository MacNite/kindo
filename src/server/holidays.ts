import { addDays, dateKey } from "@/lib/dates";
import { utcToLocalDay } from "@/lib/events";
import { inTx, type Tx } from "./db";
import { retryDelayMs } from "./jobs";
import { fetchText, normaliseFeedUrl } from "./http";
import { parseCalendar, type ParsedEvent } from "./calendar/ical";
import { errorMessage, log } from "./log";

/** How long a successful holiday sync stays fresh. */
const HOLIDAY_SYNC_HOURS = 24;

/** Holiday events as inclusive date ranges. All-day events end the day before their exclusive end. */
export function holidayRanges(events: ParsedEvent[]) {
  return events.map((e) => {
    const start = e.allDay ? utcToLocalDay(e.start) : e.start;
    const endExclusive = e.allDay ? utcToLocalDay(e.end) : e.end;
    const last = e.allDay ? addDays(endExclusive, -1) : endExclusive;
    return { start: dateKey(start), end: dateKey(last < start ? start : last), summary: e.summary };
  });
}

/**
 * Fetches the household's holiday feeds and replaces the stored ranges
 * (§7). A failing feed keeps the previous ranges and records the error, so a
 * flaky school website never turns every holiday back into a school day.
 */
export async function syncHolidays(db: Tx, now = new Date()) {
  const h = await db.household.findUnique({ where: { id: 1 }, select: { holidayIcsUrls: true } });
  if (!h) return;
  const window = { from: addDays(now, -60), to: addDays(now, 500) };
  try {
    const ranges: { start: string; end: string; summary: string; feed: string }[] = [];
    for (const url of h.holidayIcsUrls) {
      const text = await fetchText(normaliseFeedUrl(url), { maxBytes: 5 * 1024 * 1024 });
      for (const r of holidayRanges(parseCalendar(text, window))) ranges.push({ ...r, feed: url });
    }
    // Replaced in one go, one writer at a time: "Sync now" and the job at once can't double the ranges.
    const stored = await inTx(db, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('kindo:holidays', 0))`;
      const current = await tx.household.findUnique({ where: { id: 1 }, select: { holidayIcsUrls: true } });
      // The feeds changed meanwhile: that change already asked for a new sync.
      if (current?.holidayIcsUrls.join("\n") !== h.holidayIcsUrls.join("\n")) return false;
      await tx.holidayRange.deleteMany();
      if (ranges.length) await tx.holidayRange.createMany({ data: ranges });
      await tx.household.update({ where: { id: 1 }, data: { holidaysSyncedAt: now, holidaysError: null, holidaysFailedAt: null, holidaysFailures: 0 } });
      return true;
    });
    if (stored) log.info("holidays synced", { feeds: h.holidayIcsUrls.length, ranges: ranges.length });
    return ranges.length;
  } catch (e) {
    await db.household.update({
      where: { id: 1 }, data: { holidaysError: errorMessage(e).slice(0, 500), holidaysFailedAt: now, holidaysFailures: { increment: 1 } },
    });
    log.warn("holiday sync failed", { error: errorMessage(e) });
    throw e;
  }
}

/** Is a holiday sync due? After a failure, retries back off up to the normal interval. */
export async function holidaysDue(db: Tx, now = new Date()) {
  const h = await db.household.findUnique({ where: { id: 1 }, select: { holidayIcsUrls: true, holidaysSyncedAt: true, holidaysFailedAt: true, holidaysFailures: true } });
  if (!h || !h.holidayIcsUrls.length) return false;
  const interval = HOLIDAY_SYNC_HOURS * 3_600_000;
  if (h.holidaysFailedAt && h.holidaysFailures > 0) return now.getTime() - h.holidaysFailedAt.getTime() >= retryDelayMs(h.holidaysFailures, interval);
  return !h.holidaysSyncedAt || now.getTime() - h.holidaysSyncedAt.getTime() > interval;
}
