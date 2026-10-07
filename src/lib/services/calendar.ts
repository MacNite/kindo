import type { CalendarEvent, CalendarSource } from "../types";
import { CALENDAR_SOURCES, EVENTS } from "../data/calendar";
import { sameDay, startOfDay, addDays } from "../dates";

/**
 * Calendar seam. Each source type gets an adapter; the UI only sees merged
 * CalendarEvent[]. The member colour comes from source.defaultMemberIds unless
 * an event overrides it.
 *
 * Future: CaldavAdapter (Nextcloud) does PROPFIND to discover calendars and
 * REPORT calendar-query with a time-range filter, parsing VEVENT via ical.js.
 * It runs server-side (Next route handler / backend) so credentials never
 * reach the browser.
 */
export interface CalendarAdapter {
  provider: CalendarSource["provider"];
  listEvents(source: CalendarSource, from: Date, to: Date): Promise<CalendarEvent[]>;
}

export const mockAdapter: CalendarAdapter = {
  provider: "local",
  async listEvents(source, from, to) {
    return EVENTS.filter((e) => e.sourceId === source.id && e.end >= from && e.start <= to);
  },
};

// ── Synchronous selectors used by the prototype UI ─────────────────────────
export const getSources = () => CALENDAR_SOURCES;
export const getSource = (id: string) => CALENDAR_SOURCES.find((s) => s.id === id);

export function eventsBetween(from: Date, to: Date, memberFilter?: Set<string>) {
  return EVENTS.filter((e) => e.end >= from && e.start < to && matches(e, memberFilter));
}
export function eventsOn(day: Date, memberFilter?: Set<string>) {
  return EVENTS.filter((e) => (sameDay(e.start, day) || (e.start < day && e.end > day)) && matches(e, memberFilter));
}
export const eventsForMember = (memberId: string, day: Date) =>
  eventsOn(day).filter((e) => e.memberIds.includes(memberId));
export const familyEvents = (day: Date) => eventsOn(day).filter((e) => e.memberIds.length === 0);

export function upcoming(from: Date, days = 14, limit = 8) {
  return eventsBetween(from, addDays(startOfDay(from), days)).filter((e) => !e.background && e.end > from).slice(0, limit);
}

function matches(e: CalendarEvent, filter?: Set<string>) {
  if (!filter) return true;
  return e.memberIds.length === 0 || e.memberIds.some((m) => filter.has(m));
}
