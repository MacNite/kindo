import type { CalendarEvent } from "./types";
import { addDays } from "./dates";

/**
 * All-day events are dates, not instants. They are stored at UTC midnight
 * with an exclusive end (like iCalendar's DTEND), and each device turns them
 * back into its own local midnight, so "Tuesday" stays Tuesday in every zone.
 */
export const localDayToUtc = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
export const utcToLocalDay = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Normalises an event from the device's view (local midnights) for storage. */
export function allDayForStorage(e: Pick<CalendarEvent, "start" | "end" | "allDay">) {
  if (!e.allDay) return { start: e.start, end: e.end };
  const end = e.end > e.start ? e.end : addDays(e.start, 1);
  return { start: localDayToUtc(e.start), end: localDayToUtc(end) };
}

/** The reverse, applied on the device to everything the server sends. */
export function hydrateEvent(e: CalendarEvent): CalendarEvent {
  return e.allDay ? { ...e, start: utcToLocalDay(e.start), end: utcToLocalDay(e.end) } : e;
}
