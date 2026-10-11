import type { CalendarEvent, CalendarProvider, CalendarSource, EditScope } from "./types";
import { addDays, dateKey } from "./dates";

/**
 * All-day events are dates, not instants. They are stored at UTC midnight
 * with an exclusive end (like iCalendar's DTEND), and each device turns them
 * back into its own local midnight, so "Tuesday" stays Tuesday in every zone.
 */
const localDayToUtc = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
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

// ── Recurring series ────────────────────────────────────────────────────────
/**
 * What each kind of calendar lets Kindo change in a recurring series (D69),
 * in the order the editor offers it. CalDAV (Nextcloud) holds the whole
 * series as iCalendar, so all three work. Google changes one occurrence and
 * the whole series through its API, but has no "this and following": that
 * is a split Google Calendar's own app makes. Kindo's own calendar has no
 * series, and subscriptions are read only.
 */
export const SERIES_SCOPES: Record<CalendarProvider, EditScope[]> = {
  caldav: ["occurrence", "following", "series"],
  google: ["occurrence", "series"],
  ics: [],
  local: [],
};

/** Why Kindo can't change (part of) an event: the calendar is read only, the series can't be changed here, or not from this one on. */
export type EventLimit = "readOnly" | "series" | "following";

export interface EventAccess {
  /** Kindo can change or delete it (at least this occurrence). */
  editable: boolean;
  /** For an occurrence of a series: what an edit can cover. Empty for single events. */
  scopes: EditScope[];
  /** What to tell the family about what isn't possible. */
  limit?: EventLimit;
}

/**
 * Whether and how an event can be changed from Kindo. The server checks the
 * same before it writes, so a screen showing old data can't get further.
 */
export function eventAccess(source: Pick<CalendarSource, "provider" | "readOnly"> | undefined, e: Pick<CalendarEvent, "recurring" | "recurrenceId">): EventAccess {
  if (!source || source.readOnly) return { editable: false, scopes: [], limit: "readOnly" };
  if (!e.recurring) return { editable: true, scopes: [] };
  const scopes = e.recurrenceId ? SERIES_SCOPES[source.provider] : [];
  if (!scopes.length) return { editable: false, scopes, limit: "series" };
  return { editable: true, scopes, ...(scopes.includes("following") ? {} : { limit: "following" as const }) };
}

// ── The event editor ────────────────────────────────────────────────────────
/**
 * What the event editor shows: a start date, an end date and, for timed
 * events, two times. All-day events show their last day (the stored end is
 * exclusive, D17), so a weekend away is Saturday to Sunday.
 */
export interface EventForm { allDay: boolean; date: string; endDate: string; from: string; to: string }

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const atTime = (day: string, time: string) => {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
};

export function eventForm(e: Pick<CalendarEvent, "start" | "end" | "allDay">): EventForm {
  const last = e.allDay ? addDays(e.end, -1) : e.end;
  return {
    allDay: Boolean(e.allDay),
    date: dateKey(e.start),
    endDate: dateKey(last < e.start ? e.start : last),
    from: e.allDay ? "15:00" : hhmm(e.start),
    to: e.allDay ? "16:00" : hhmm(e.end),
  };
}

/**
 * The event's start and end from the form. An end before the start date is
 * the start date; on the same day, an end time before the start time means
 * the next morning (a sleepover, a night shift). All-day events end after
 * their last day.
 */
export function eventTimes(f: EventForm): { start: Date; end: Date } {
  const endDate = f.endDate < f.date ? f.date : f.endDate;
  if (f.allDay) return { start: atTime(f.date, "00:00"), end: addDays(atTime(endDate, "00:00"), 1) };
  const start = atTime(f.date, f.from);
  let end = atTime(endDate, f.to);
  if (end <= start && endDate === f.date) end = addDays(end, 1);
  if (end <= start) end = new Date(start.getTime() + 3_600_000);
  return { start, end };
}

/** Does the form's timed event end on a later day than it starts? */
export const endsNextDay = (f: EventForm) => !f.allDay && dateKey(eventTimes(f).end) !== f.date;

/**
 * Moves the start (date or time) and keeps the event's length, the way
 * calendar apps do: moving Saturday's trip to Sunday moves its end too.
 */
export function moveStart(f: EventForm, patch: Partial<Pick<EventForm, "date" | "from">>): EventForm {
  const { start, end } = eventTimes(f);
  const next = { ...f, ...patch };
  if (f.allDay) {
    const days = Math.round((atTime(f.endDate < f.date ? f.date : f.endDate, "12:00").getTime() - atTime(f.date, "12:00").getTime()) / 86_400_000);
    return { ...next, endDate: dateKey(addDays(atTime(next.date, "00:00"), days)) };
  }
  const s = atTime(next.date, next.from);
  const e = new Date(s.getTime() + (end.getTime() - start.getTime()));
  return { ...next, endDate: dateKey(e), to: hhmm(e) };
}

// ── The week view ───────────────────────────────────────────────────────────
/**
 * The part of a timed event that shows in `day`'s column, in minutes after
 * midnight, cut to that day and to the visible hours [h0, h1). An event
 * entirely outside them sits at the nearest edge with no length. Says whether
 * it began before this day (an overnight event continuing) or goes on after
 * it. Null when the event doesn't touch the day.
 */
export interface DaySegment { top: number; bottom: number; fromPrev: boolean; toNext: boolean }
export function daySegment(e: Pick<CalendarEvent, "start" | "end">, day: Date, h0: number, h1: number): DaySegment | null {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = addDays(dayStart, 1);
  if (e.end <= dayStart || e.start >= dayEnd) {
    // A zero-length event at midnight still belongs to its day.
    if (!(e.start.getTime() === e.end.getTime() && e.start.getTime() === dayStart.getTime())) return null;
  }
  const fromPrev = e.start < dayStart, toNext = e.end > dayEnd;
  const mins = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const lo = h0 * 60, hi = h1 * 60;
  const clamp = (m: number) => Math.min(hi, Math.max(lo, m));
  const top = clamp(fromPrev ? 0 : mins(e.start));
  const bottom = Math.max(top, clamp(toNext ? 24 * 60 : e.end.getTime() === dayEnd.getTime() ? 24 * 60 : mins(e.end)));
  return { top, bottom, fromPrev, toNext };
}
