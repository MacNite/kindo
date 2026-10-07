import type { Recurrence, Weekday } from "./types";
import { DAY, dateKey } from "./dates";

/**
 * Minimal matcher so the prototype can show "what's due today".
 * A real engine (RRULE-compatible, so it maps onto CalDAV VTODO/VEVENT)
 * replaces this later; the Recurrence type is the stable contract.
 */
const EPOCH_MONDAY = new Date(2024, 0, 1); // used for "every N weeks" phase

/** Whole calendar days between two dates, immune to DST (23h/25h days). */
const calendarDays = (from: Date, to: Date) =>
  Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / DAY);

export function occursOn(r: Recurrence, date: Date, isSchoolDay: (d: Date) => boolean = defaultSchoolDay): boolean {
  const dow = date.getDay() as Weekday;
  switch (r.kind) {
    case "daily": return true;
    case "weekdays": return r.days.includes(dow);
    case "weekly": {
      if (dow !== r.day) return false;
      const weeks = Math.floor(calendarDays(EPOCH_MONDAY, date) / 7);
      return weeks % Math.max(1, r.interval) === 0;
    }
    case "monthly": return date.getDate() === r.dayOfMonth;
    case "once": return dateKey(date) === r.date;
    case "schoolDays": return isSchoolDay(date);
  }
}

/** Mock school calendar: Mon–Fri. Later fed by a holiday ICS subscription. */
export const defaultSchoolDay = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5;

/** RRULE string preview — shows how this maps to CalDAV later. */
export function toRRule(r: Recurrence): string {
  const map = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  switch (r.kind) {
    case "daily": return "FREQ=DAILY";
    case "weekdays": return `FREQ=WEEKLY;BYDAY=${r.days.map((d) => map[d]).join(",")}`;
    case "weekly": return `FREQ=WEEKLY;INTERVAL=${r.interval};BYDAY=${map[r.day]}`;
    case "monthly": return `FREQ=MONTHLY;BYMONTHDAY=${r.dayOfMonth}`;
    case "once": return `DTSTART=${r.date.replaceAll("-", "")}`;
    case "schoolDays": return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;X-EXCEPT=school-holidays";
  }
}
