import type { Recurrence, Weekday } from "./types";
import { DAY, addDays, dateKey, startOfDay, wallClockIn } from "./dates";

/**
 * The recurrence engine (§7, §19.3). Pure and RFC 5545 compatible, so
 * routines and chores can round-trip through CalDAV (`toRRule`/`fromRRule`).
 * Everything works on local calendar dates; the time of day never matters.
 */

/** Phase for "every N weeks" without an explicit start: the Monday of 1 January 2024. */
const EPOCH_MONDAY = new Date(2024, 0, 1);

/** Whole calendar days between two dates, immune to DST (23h/25h days). */
const calendarDays = (from: Date, to: Date) =>
  Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / DAY);

export const parseDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Is this a school day? Monday to Friday, minus holidays from the household's feeds. */
export type SchoolDays = (d: Date) => boolean;
export const defaultSchoolDay: SchoolDays = (d) => d.getDay() >= 1 && d.getDay() <= 5;

/** Builds the school-day test from holiday ranges (YYYY-MM-DD, inclusive). */
export function schoolDaysFrom(holidays: { start: string; end: string }[]): SchoolDays {
  if (!holidays.length) return defaultSchoolDay;
  const sorted = [...holidays].sort((a, b) => a.start.localeCompare(b.start));
  return (d) => {
    if (!defaultSchoolDay(d)) return false;
    const k = dateKey(d);
    return !sorted.some((h) => h.start <= k && k <= h.end);
  };
}

export function occursOn(r: Recurrence, date: Date, isSchoolDay: SchoolDays = defaultSchoolDay): boolean {
  const dow = date.getDay() as Weekday;
  switch (r.kind) {
    case "daily": return true;
    case "weekdays": return r.days.includes(dow);
    case "weekly": {
      if (dow !== r.day) return false;
      const anchor = r.from ? parseDay(r.from) : EPOCH_MONDAY;
      const days = calendarDays(anchor, date);
      if (r.from && days < 0) return false;
      const weeks = Math.floor(days / 7);
      return ((weeks % Math.max(1, r.interval)) + r.interval) % Math.max(1, r.interval) === 0;
    }
    case "monthly": {
      // Day 31 falls on the last day of shorter months, so it never silently skips one.
      const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return date.getDate() === Math.min(r.dayOfMonth, last);
    }
    case "once": return dateKey(date) === r.date;
    case "schoolDays": return isSchoolDay(date);
  }
}

/** Every date in [from, to] (inclusive, by calendar day) on which `r` occurs. */
export function occurrences(r: Recurrence, from: Date, to: Date, isSchoolDay: SchoolDays = defaultSchoolDay): Date[] {
  const out: Date[] = [];
  const start = startOfDay(from);
  const n = calendarDays(start, to);
  if (r.kind === "once") {
    const d = parseDay(r.date);
    return d >= start && calendarDays(d, to) >= 0 ? [d] : [];
  }
  for (let i = 0; i <= n; i++) {
    const d = addDays(start, i);
    if (occursOn(r, d, isSchoolDay)) out.push(d);
  }
  return out;
}

/** The next `count` occurrences from `from` on, looking at most `horizon` days ahead. */
export function nextOccurrences(r: Recurrence, from: Date, count: number, isSchoolDay: SchoolDays = defaultSchoolDay, horizon = 800): Date[] {
  const out: Date[] = [];
  const start = startOfDay(from);
  if (r.kind === "once") return occurrences(r, start, addDays(start, horizon));
  for (let i = 0; i < horizon && out.length < count; i++) {
    const d = addDays(start, i);
    if (occursOn(r, d, isSchoolDay)) out.push(d);
  }
  return out;
}

// ── Comparing ───────────────────────────────────────────────────────────────
/** One spelling per rhythm: weekdays sorted and unique, all seven days are "daily". */
export function normalizeRecurrence(r: Recurrence): Recurrence {
  if (r.kind !== "weekdays") return r;
  const days = [...new Set(r.days)].sort((a, b) => a - b);
  return days.length === 7 ? { kind: "daily" } : { kind: "weekdays", days };
}

/** A stable key for a rhythm: two recurrences with the same key fall on the same days. */
export function recurrenceKey(r: Recurrence): string {
  const n = normalizeRecurrence(r);
  switch (n.kind) {
    case "weekdays": return `weekdays:${n.days.join(",")}`;
    case "weekly": return `weekly:${n.day}:${n.interval}:${n.from ?? ""}`;
    case "monthly": return `monthly:${n.dayOfMonth}`;
    case "once": return `once:${n.date}`;
    default: return n.kind;
  }
}

export const sameRecurrence = (a: Recurrence, b: Recurrence) => recurrenceKey(a) === recurrenceKey(b);

// ── RFC 5545 ────────────────────────────────────────────────────────────────
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const ymd = (s: string) => s.replaceAll("-", "");

/** The start date (DTSTART) a recurrence's rule is anchored on. */
function recurrenceStart(r: Recurrence): string {
  if (r.kind === "once") return r.date;
  if (r.kind === "weekly") {
    if (r.from) return r.from;
    return dateKey(addDays(EPOCH_MONDAY, (r.day + 6) % 7));
  }
  return dateKey(EPOCH_MONDAY);
}

/**
 * The RRULE value for a recurrence, anchored on `recurrenceStart`. School days
 * are weekdays in iCalendar; the holidays become EXDATEs when written out.
 */
export function toRRule(r: Recurrence): string {
  switch (r.kind) {
    case "daily": return "FREQ=DAILY";
    case "weekdays": return `FREQ=WEEKLY;BYDAY=${[...r.days].sort().map((d) => BYDAY[d]).join(",")}`;
    case "weekly": return r.interval > 1 ? `FREQ=WEEKLY;INTERVAL=${r.interval};BYDAY=${BYDAY[r.day]}` : `FREQ=WEEKLY;BYDAY=${BYDAY[r.day]}`;
    case "monthly": return `FREQ=MONTHLY;BYMONTHDAY=${r.dayOfMonth}`;
    case "once": return "FREQ=DAILY;COUNT=1";
    case "schoolDays": return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  }
}

/** DTSTART and RRULE lines as they appear in a VTODO or VEVENT. */
export function toICalLines(r: Recurrence): string[] {
  return [`DTSTART;VALUE=DATE:${ymd(recurrenceStart(r))}`, `RRULE:${toRRule(r)}`];
}

/**
 * Reads an RRULE back (the subset Kindo writes, and what calendar apps
 * commonly produce for these patterns). Returns null for rules Kindo cannot
 * represent, e.g. "every second Tuesday of the month".
 */
export function fromRRule(rule: string, dtstart: string): Recurrence | null {
  const parts = Object.fromEntries(rule.replace(/^RRULE:/i, "").split(";").map((p) => p.split("=") as [string, string]).map(([k, v]) => [k.toUpperCase(), v?.toUpperCase()]));
  const interval = Number(parts.INTERVAL ?? 1);
  const days = parts.BYDAY ? parts.BYDAY.split(",").map((d: string) => BYDAY.indexOf(d)) : [];
  if (days.some((d: number) => d < 0)) return null; // "2TU" and the like
  const start = /^\d{8}$/.test(dtstart) ? `${dtstart.slice(0, 4)}-${dtstart.slice(4, 6)}-${dtstart.slice(6, 8)}` : dtstart;
  if (parts.COUNT === "1") return { kind: "once", date: start };
  if (parts.COUNT || parts.UNTIL) return null;
  switch (parts.FREQ) {
    case "DAILY": return interval === 1 ? { kind: "daily" } : null;
    case "WEEKLY": {
      const byday = days.length ? days : [parseDay(start).getDay()];
      if (interval === 1 && byday.length === 1) return { kind: "weekly", day: byday[0] as Weekday, interval: 1 };
      if (interval === 1) return { kind: "weekdays", days: [...byday].sort() as Weekday[] };
      if (byday.length === 1) return { kind: "weekly", day: byday[0] as Weekday, interval, from: start };
      return null;
    }
    case "MONTHLY": {
      const dom = Number(parts.BYMONTHDAY ?? parseDay(start).getDate());
      return interval === 1 && dom >= 1 && dom <= 31 ? { kind: "monthly", dayOfMonth: dom } : null;
    }
    default: return null;
  }
}

// ── The household day ──────────────────────────────────────────────────────
export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * The household day `now` belongs to (§19.3). Routines reset at `dayStartsAt`,
 * not at midnight, so ticking off the evening routine at 00:30 still counts
 * for the evening before.
 */
export function householdDay(now: Date, dayStartsAt = "00:00"): Date {
  const mins = now.getHours() * 60 + now.getMinutes();
  const day = startOfDay(now);
  return mins < minutesOf(dayStartsAt) ? addDays(day, -1) : day;
}

/**
 * The household day key in a time zone: the server's view, independent of
 * the server's own TZ. Used to check the days devices send.
 */
export function householdDayKeyIn(now: Date, timeZone: string, dayStartsAt = "00:00"): string {
  return dateKey(householdDayIn(now, timeZone, dayStartsAt));
}

/**
 * The household day in the household's time zone, as a local-midnight Date
 * (D19, D52): a phone in another time zone still shows the family's today.
 */
export const householdDayIn = (now: Date, timeZone: string | undefined, dayStartsAt = "00:00") =>
  householdDay(wallClockIn(now, timeZone), dayStartsAt);

export interface DayTimes { dayStartsAt: string; morningUntil: string; afternoonUntil: string }
export const DEFAULT_TIMES: DayTimes = { dayStartsAt: "03:00", morningUntil: "11:00", afternoonUntil: "17:00" };

/** Which routine the wall shows "now". Before the day starts it is still last evening. */
export function currentPeriod(now: Date, times: DayTimes = DEFAULT_TIMES, timeZone?: string): "morning" | "afternoon" | "evening" {
  const clock = wallClockIn(now, timeZone);
  const t = clock.getHours() * 60 + clock.getMinutes();
  if (t < minutesOf(times.dayStartsAt)) return "evening";
  if (t < minutesOf(times.morningUntil)) return "morning";
  if (t < minutesOf(times.afternoonUntil)) return "afternoon";
  return "evening";
}
