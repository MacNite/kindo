import type { CalendarEvent, CalendarSource } from "../types";
import { addDays, sameDay, startOfDay } from "../dates";

/**
 * Calendar selectors (§5). The server merges every source (CalDAV, Google,
 * ICS, Kindo's own) into one event list; the member colour comes from the
 * source's default members unless an event names its own.
 */
export function calendarSelectors(sources: CalendarSource[], events: CalendarEvent[]) {
  const getSources = () => sources;
  const getSource = (id: string) => sources.find((s) => s.id === id);

  const eventsBetween = (from: Date, to: Date, memberFilter?: Set<string>) =>
    events.filter((e) => e.end >= from && e.start < to && matches(e, memberFilter));
  const eventsOn = (day: Date, memberFilter?: Set<string>) =>
    events.filter((e) => (sameDay(e.start, day) || (e.start < day && e.end > day)) && matches(e, memberFilter));
  const eventsForMember = (memberId: string, day: Date) => eventsOn(day).filter((e) => e.memberIds.includes(memberId));
  const familyEvents = (day: Date) => eventsOn(day).filter((e) => e.memberIds.length === 0);

  /** Next events within `days`. `afterToday` skips events starting on `from`'s day (before the limit is applied). */
  function upcoming(from: Date, days = 14, limit = 8, { afterToday = false } = {}) {
    const start = afterToday ? addDays(startOfDay(from), 1) : from;
    return eventsBetween(start, addDays(startOfDay(from), days))
      .filter((e) => !e.background && e.end > start && !(afterToday && e.start < start))
      .slice(0, limit);
  }

  return { getSources, getSource, eventsBetween, eventsOn, eventsForMember, familyEvents, upcoming };
}

function matches(e: CalendarEvent, filter?: Set<string>) {
  if (!filter) return true;
  return e.memberIds.length === 0 || e.memberIds.some((m) => filter.has(m));
}
