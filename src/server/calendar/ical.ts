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

/** Upper bound on occurrences per series inside the window, so a rule without end can't run away. */
const MAX_OCCURRENCES = 1500;
/** Upper bound on steps through one series, before and in the window, for rules that can't skip ahead. */
const MAX_STEPS = 50_000;
const DAY_MS = 86_400_000;

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
  // ical.js reads commas in unknown X- properties as several values: take them all.
  const members = comp.getFirstProperty("x-kindo-members")?.getValues().map(String).join(",");
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
    memberIds: members ? members.split(/[\s,]+/).filter(Boolean) : undefined,
    icon: typeof icon === "string" && icon ? icon : undefined,
  };
}

/**
 * Where to start stepping through a daily or weekly series: a whole number of
 * its periods after DTSTART, shortly before the window. The occurrences from
 * there on are the same, so a series that began years ago costs no more than
 * a new one. Undefined (start at DTSTART) for rules that count occurrences or
 * have extra dates: those are walked from the start, up to MAX_STEPS.
 */
function skipAhead(master: ICAL.Event, from: Date): ICAL.Time | undefined {
  const comp = master.component;
  const rules = comp.getAllProperties("rrule");
  if (rules.length !== 1 || comp.hasProperty("rdate")) return undefined;
  const rule = rules[0].getFirstValue() as ICAL.Recur;
  if (rule.count) return undefined;
  const periodDays = (rule.freq === "DAILY" ? 1 : rule.freq === "WEEKLY" ? 7 : 0) * (rule.interval || 1);
  if (!periodDays) return undefined;
  const start = master.startDate;
  const length = Math.max(0, master.endDate.toJSDate().getTime() - start.toJSDate().getTime());
  // A margin for long occurrences and time zones: starting a little early is harmless.
  const gap = from.getTime() - start.toJSDate().getTime() - length - 2 * periodDays * DAY_MS;
  const periods = Math.floor(gap / (periodDays * DAY_MS));
  if (periods <= 0) return undefined;
  const shifted = start.clone();
  // Moves the wall-clock date, so a 16:30 class stays at 16:30 across daylight saving.
  shifted.adjust(periods * periodDays, 0, 0, 0);
  return shifted;
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
    const it = master.iterator(skipAhead(master, window.from));
    let found = 0;
    for (let i = 0, next = it.next(); next && i < MAX_STEPS && found < MAX_OCCURRENCES; i++, next = it.next()) {
      const occ = master.getOccurrenceDetails(next);
      const e = details(occ.item, occ.startDate, occ.endDate, true);
      // A moved occurrence (RECURRENCE-ID) can come back into the window: the series' own date ends the loop.
      if (e.start >= window.to && next.toJSDate() >= window.to) break;
      if (touches(e)) {
        out.push(e);
        found++;
      }
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ── Writing ─────────────────────────────────────────────────────────────────
export interface EventToWrite {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  /** Dates at UTC midnight with an exclusive end (§20 D17). */
  allDay: boolean;
  location?: string;
  memberIds: string[];
  icon?: string;
}

const icalDate = (d: Date) => ICAL.Time.fromData({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), isDate: true });

/**
 * One VEVENT in its own VCALENDAR, as CalDAV stores it. Times are written in
 * UTC, which every calendar app reads; Kindo's member assignment travels in
 * X-KINDO-MEMBERS so it survives the round trip (§5).
 */
export function buildEventIcs(e: EventToWrite, now = new Date()): string {
  const cal = new ICAL.Component(["vcalendar", [], []]);
  cal.updatePropertyWithValue("prodid", "-//Kindo//Family dashboard//EN");
  cal.updatePropertyWithValue("version", "2.0");
  const v = new ICAL.Component("vevent");
  v.updatePropertyWithValue("uid", e.uid);
  v.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(now, true));
  v.updatePropertyWithValue("summary", e.title);
  if (e.allDay) {
    v.updatePropertyWithValue("dtstart", icalDate(e.start));
    v.updatePropertyWithValue("dtend", icalDate(e.end));
  } else {
    v.updatePropertyWithValue("dtstart", ICAL.Time.fromJSDate(e.start, true));
    v.updatePropertyWithValue("dtend", ICAL.Time.fromJSDate(e.end, true));
  }
  if (e.location) v.updatePropertyWithValue("location", e.location);
  // Space-separated: some servers keep only the first of comma-separated values in unknown properties.
  if (e.memberIds.length) v.updatePropertyWithValue("x-kindo-members", e.memberIds.join(" "));
  if (e.icon) v.updatePropertyWithValue("x-kindo-icon", e.icon);
  cal.addSubcomponent(v);
  return cal.toString();
}
