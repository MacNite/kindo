import { addDays, dateKey } from "@/lib/dates";
import { utcToLocalDay } from "@/lib/events";
import type { Tx } from "./db";
import { fetchText, normaliseFeedUrl } from "./http";
import { parseCalendar, type ParsedEvent } from "./calendar/ical";
import { errorMessage, log } from "./log";

/** How long a successful holiday sync stays fresh. */
export const HOLIDAY_SYNC_HOURS = 24;

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
    await db.holidayRange.deleteMany();
    if (ranges.length) await db.holidayRange.createMany({ data: ranges });
    await db.household.update({ where: { id: 1 }, data: { holidaysSyncedAt: now, holidaysError: null } });
    log.info("holidays synced", { feeds: h.holidayIcsUrls.length, ranges: ranges.length });
    return ranges.length;
  } catch (e) {
    await db.household.update({ where: { id: 1 }, data: { holidaysError: errorMessage(e).slice(0, 500) } });
    log.warn("holiday sync failed", { error: errorMessage(e) });
    throw e;
  }
}

/** Is a holiday sync due? */
export async function holidaysDue(db: Tx, now = new Date()) {
  const h = await db.household.findUnique({ where: { id: 1 }, select: { holidayIcsUrls: true, holidaysSyncedAt: true } });
  if (!h || !h.holidayIcsUrls.length) return false;
  return !h.holidaysSyncedAt || now.getTime() - h.holidaysSyncedAt.getTime() > HOLIDAY_SYNC_HOURS * 3_600_000;
}
