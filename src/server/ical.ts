import ICAL from "ical.js";

/**
 * iCalendar parsing for every calendar source (§5): holiday feeds, ICS
 * subscriptions, CalDAV and Google exports. Recurring events are expanded
 * into occurrences inside a window, with exceptions (RECURRENCE-ID) and
 * EXDATEs applied, and VTIMEZONEs honoured.
 *
 * All-day events come out at UTC midnight with an exclusive end (§20 D17).
 */
export interface ParsedEvent {
  uid: string;
  summary: string;
  location?: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  /** Part of a recurring series: Kindo shows it but edits only single events. */
  recurring: boolean;
  /** X-KINDO-MEMBERS: the people Kindo assigned when it wrote the event. */
  memberIds?: string[];
  /** X-KINDO-ICON */
  icon?: string;
}

/** Upper bound on occurrences per series, so a daily rule without end can't run away. */
const MAX_OCCURRENCES = 1500;

const dateOf = (t: ICAL.Time) => (t.isDate ? new Date(Date.UTC(t.year, t.month - 1, t.day)) : t.toJSDate());

function registerTimezones(cal: ICAL.Component) {
  for (const tz of cal.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      // A malformed VTIMEZONE falls back to UTC/floating; the event still shows.
    }
  }
}

function details(ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time, recurring: boolean): ParsedEvent {
  const comp = ev.component;
  const members = comp.getFirstPropertyValue("x-kindo-members");
  const icon = comp.getFirstPropertyValue("x-kindo-icon");
  let endDate = dateOf(end);
  const startDate = dateOf(start);
  // A missing DTEND means one day for dates and zero length for times.
  if (endDate <= startDate) endDate = start.isDate ? new Date(startDate.getTime() + 86_400_000) : startDate;
  return {
    uid: ev.uid || "",
    summary: ev.summary || "",
    location: ev.location || undefined,
    description: ev.description || undefined,
    start: startDate,
    end: endDate,
    allDay: start.isDate,
    recurring,
    memberIds: typeof members === "string" && members ? members.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    icon: typeof icon === "string" && icon ? icon : undefined,
  };
}

/** Parses one iCalendar document and returns the events that touch [from, to). */
export function parseCalendar(text: string, window: { from: Date; to: Date }): ParsedEvent[] {
  const cal = new ICAL.Component(ICAL.parse(text));
  registerTimezones(cal);
  const vevents = cal.getAllSubcomponents("vevent");

  // Group by UID: the series master and its exceptions travel together.
  const byUid = new Map<string, { master?: ICAL.Event; exceptions: ICAL.Event[] }>();
  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    const g = byUid.get(ev.uid) ?? { exceptions: [] };
    if (ev.isRecurrenceException()) g.exceptions.push(ev);
    else g.master = ev;
    byUid.set(ev.uid, g);
  }

  const out: ParsedEvent[] = [];
  const touches = (e: ParsedEvent) => e.end > window.from && e.start < window.to;
  for (const { master, exceptions } of byUid.values()) {
    if (!master) {
      // Exceptions whose master lives elsewhere: show them as single events.
      for (const ex of exceptions) {
        const e = details(ex, ex.startDate, ex.endDate, true);
        if (touches(e)) out.push(e);
      }
      continue;
    }
    if (!master.isRecurring()) {
      const e = details(master, master.startDate, master.endDate, false);
      if (touches(e)) out.push(e);
      continue;
    }
    for (const ex of exceptions) master.relateException(ex);
    const it = master.iterator();
    for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
      const occ = master.getOccurrenceDetails(next);
      const e = details(occ.item, occ.startDate, occ.endDate, true);
      if (e.start >= window.to) break;
      if (touches(e)) out.push(e);
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}
