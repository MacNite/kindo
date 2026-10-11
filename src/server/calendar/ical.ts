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
  /** Part of a recurring series. */
  recurring: boolean;
  /**
   * Which occurrence of its series this is: its original start (RECURRENCE-ID),
   * even when it was moved. Missing for single events and for exceptions whose
   * series isn't in the same object, which Kindo can't change.
   */
  recurrenceId?: Date;
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

function details(ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time, recurring: boolean, recurrenceId?: ICAL.Time): ParsedEvent {
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
    ...(recurrenceId ? { recurrenceId: dateOf(recurrenceId) } : {}),
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
      const e = details(occ.item, occ.startDate, occ.endDate, true, occ.recurrenceId);
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

/**
 * Applies Kindo's edit to the event as its server has it: title, times,
 * place and people change, everything else (description, alarms, attendees,
 * categories, other apps' properties, the time zone) stays as it was. A time
 * that moves is written in the event's own time zone when the calendar
 * carries it, in UTC otherwise.
 */
export function updateEventIcs(text: string, e: EventToWrite, now = new Date()): string {
  const cal = new ICAL.Component(ICAL.parse(text));
  registerTimezones(cal);
  const vevents = cal.getAllSubcomponents("vevent");
  const v = vevents.find((c) => !c.hasProperty("recurrence-id") && c.getFirstPropertyValue("uid") === e.uid) ?? vevents.find((c) => !c.hasProperty("recurrence-id"));
  if (!v) throw new Error("no VEVENT to update");
  editComponent(v, e, now);
  return cal.toString();
}

/** A time as `like` writes it: a date for dates, in its time zone, UTC or floating as it was. */
function timeLike(like: ICAL.Time, d: Date, allDay = like.isDate): ICAL.Time {
  if (allDay) return icalDate(d);
  const zone = like.zone;
  if (zone === ICAL.Timezone.localTimezone) return ICAL.Time.fromJSDate(d, false);
  const utc = ICAL.Time.fromJSDate(d, true);
  return zone && zone !== ICAL.Timezone.utcTimezone ? utc.convertToZone(zone) : utc;
}

/** Sets a time property the way ical.js does for DTSTART: with its TZID, unless UTC, floating or a date. */
function setTime(p: ICAL.Property, t: ICAL.Time) {
  p.setValue(t);
  const tzid = t.zone?.tzid;
  if (!t.isDate && tzid && t.zone !== ICAL.Timezone.utcTimezone && t.zone !== ICAL.Timezone.localTimezone && tzid !== "floating") p.setParameter("tzid", tzid);
  else p.removeParameter("tzid");
}

const stamp = (v: ICAL.Component, now: Date, moved: boolean) => {
  const t = ICAL.Time.fromJSDate(now, true);
  v.updatePropertyWithValue("dtstamp", t);
  if (v.hasProperty("last-modified")) v.updatePropertyWithValue("last-modified", t);
  // RFC 5545: a new time is a new revision, so invitees' apps take it.
  if (moved) v.updatePropertyWithValue("sequence", Number(v.getFirstPropertyValue("sequence") ?? 0) + 1);
};

/**
 * Applies Kindo's edit to one VEVENT: title, times, place and people change,
 * everything else stays as it was.
 */
function editComponent(v: ICAL.Component, e: EventToWrite, now: Date) {
  const ev = new ICAL.Event(v);
  const parsed = () => details(ev, ev.startDate, ev.endDate, false);
  ev.summary = e.title;
  let moved = false;
  const before = parsed();
  if (before.allDay !== e.allDay || before.start.getTime() !== e.start.getTime()) {
    ev.startDate = timeLike(ev.startDate, e.start, e.allDay);
    moved = true;
  }
  // After the start: an event with a DURATION moves its end along with it.
  const after = parsed();
  const endIsDate = v.hasProperty("dtend") ? ev.endDate.isDate : e.allDay;
  if (endIsDate !== e.allDay || after.end.getTime() !== e.end.getTime()) {
    ev.endDate = timeLike(ev.startDate, e.end, e.allDay);
    moved = true;
  }
  if (e.location) ev.location = e.location;
  else v.removeAllProperties("location");
  if (e.memberIds.length) v.updatePropertyWithValue("x-kindo-members", e.memberIds.join(" "));
  else v.removeAllProperties("x-kindo-members");
  if (e.icon) v.updatePropertyWithValue("x-kindo-icon", e.icon);
  stamp(v, now, moved);
}

// ── Recurring series ────────────────────────────────────────────────────────
/**
 * Changing part of a recurring series (§5, §20 D70), as calendar apps do it:
 *
 * - one occurrence: an exception (a VEVENT with its RECURRENCE-ID) for an
 *   edit, an EXDATE for a cancellation;
 * - this and following: the series ends before the occurrence (UNTIL, or a
 *   shorter COUNT) and a new series with a new UID starts there, taking the
 *   later exceptions and EXDATEs along;
 * - the whole series: the series itself, its exceptions kept.
 *
 * An edit of several occurrences applies only what was changed in the
 * editor, so an exception keeps what it changed itself (a later start, its
 * own title). A new time becomes the series' time of day in its own time
 * zone, so 17:00 stays 17:00 across daylight saving; RECURRENCE-IDs and
 * EXDATEs move with the series, so no exception is lost or comes back.
 * Moving several occurrences to another day is left to the calendar app: a
 * rule like "every Wednesday" can't say what that would mean.
 */
export type SeriesScope = "occurrence" | "following" | "series";

/** The series is no longer as Kindo saw it: the occurrence is gone or was never part of it. */
export class SeriesChanged extends Error {}
/** An edit Kindo doesn't make on several occurrences at once. */
export class SeriesEditRefused extends Error {}

export interface SeriesTarget {
  uid: string;
  /** The occurrence's original start (see `ParsedEvent.recurrenceId`). */
  recurrenceId: Date;
  /** The occurrence as Kindo showed it; the edit's changes are what differs from this. */
  shown: EventToWrite;
}

export interface SeriesResult {
  /** The object afterwards; null when nothing of it is left (the whole series deleted). */
  text: string | null;
  /** "This and following": the new series, a calendar object of its own. */
  created?: { uid: string; text: string };
}

const sameInstant = (a: ICAL.Time, b: Date) => dateOf(a).getTime() === b.getTime();
const ridOf = (c: ICAL.Component) => c.getFirstPropertyValue("recurrence-id") as ICAL.Time | null;
const membersOf = (c: ICAL.Component) => c.getFirstProperty("x-kindo-members")?.getValues().map(String).join(",").split(/[\s,]+/).filter(Boolean).join(" ") ?? "";
const minutesOfDay = (t: ICAL.Time) => t.hour * 60 + t.minute;
const sameDate = (a: ICAL.Time, b: ICAL.Time) => a.year === b.year && a.month === b.month && a.day === b.day;

/** What an edit of several occurrences changes, measured against the occurrence as it was shown. */
interface Changes {
  title?: string;
  location?: string;
  memberIds?: string[];
  /** Wall-clock minutes the series' times move by. */
  shift: number;
  /** New length (minutes, or days for dates), when it changed. */
  length?: number;
}

function changesOf(first: ICAL.Time, t: SeriesTarget, e: EventToWrite): Changes {
  const { shown } = t;
  if (shown.allDay !== e.allDay) throw new SeriesEditRefused("a series stays all-day or timed");
  const from = timeLike(first, shown.start), to = timeLike(first, e.start);
  if (!sameDate(from, to)) throw new SeriesEditRefused("several occurrences move only within their day");
  // A new time is the series' new time of day, also when edited on an exception that had its own.
  const retimed = minutesOfDay(to) !== minutesOfDay(from);
  const lengthOf = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / (e.allDay ? DAY_MS : 60_000));
  const length = lengthOf(e.start, e.end);
  return {
    ...(e.title !== shown.title ? { title: e.title } : {}),
    ...((e.location ?? "") !== (shown.location ?? "") ? { location: e.location ?? "" } : {}),
    ...(e.memberIds.join(" ") !== shown.memberIds.join(" ") ? { memberIds: e.memberIds } : {}),
    shift: e.allDay || !retimed ? 0 : minutesOfDay(to) - minutesOfDay(first),
    ...(length !== lengthOf(shown.start, shown.end) ? { length } : {}),
  };
}

const shifted = (t: ICAL.Time, minutes: number) => {
  const out = t.clone();
  if (minutes && !out.isDate) out.adjust(0, 0, minutes, 0);
  return out;
};

/** Moves every value of a time property (RECURRENCE-ID, EXDATE, RDATE) by the shift. */
function shiftProperty(p: ICAL.Property, minutes: number) {
  if (!minutes) return;
  const values = p.getValues().map((v) => (v instanceof ICAL.Time ? shifted(v, minutes) : v));
  if (values.length === 1) p.setValue(values[0]);
  else p.setValues(values);
}

/** Keeps the values of a multi-valued time property that pass `keep`; drops the property when none do. */
function filterProperty(c: ICAL.Component, name: string, keep: (d: Date) => boolean) {
  for (const p of c.getAllProperties(name)) {
    const values = p.getValues();
    const kept = values.filter((v) => !(v instanceof ICAL.Time) || keep(dateOf(v)));
    if (!kept.length) c.removeProperty(p);
    else if (kept.length !== values.length) p.setValues(kept);
  }
}

/**
 * Applies an edit of several occurrences to the series itself: the changed
 * fields, the times moved by the shift, the new length.
 */
function applyToMaster(v: ICAL.Component, c: Changes) {
  const ev = new ICAL.Event(v);
  if (c.title !== undefined) ev.summary = c.title;
  if (c.location !== undefined) {
    if (c.location) ev.location = c.location;
    else v.removeAllProperties("location");
  }
  if (c.memberIds) {
    if (c.memberIds.length) v.updatePropertyWithValue("x-kindo-members", c.memberIds.join(" "));
    else v.removeAllProperties("x-kindo-members");
  }
  if (!c.shift && c.length === undefined) return false;
  const hadEnd = v.hasProperty("dtend");
  const length = ev.duration;
  ev.startDate = shifted(ev.startDate, c.shift);
  if (c.length !== undefined) {
    const end = ev.startDate.clone();
    if (end.isDate) end.adjust(c.length, 0, 0, 0);
    else end.adjust(0, 0, c.length, 0);
    if (hadEnd) ev.endDate = end;
    else ev.duration = end.subtractDate(ev.startDate);
  } else if (hadEnd) {
    const end = ev.startDate.clone();
    end.addDuration(length);
    ev.endDate = end;
  }
  return true;
}

/**
 * Carries an edit of several occurrences into an exception: its RECURRENCE-ID
 * moves with the series; a field it didn't change itself (same as the series
 * had) takes the new value; its times follow only if it wasn't moved.
 */
function applyToException(v: ICAL.Component, c: Changes, before: { summary: string; location: string; members: string; length: number }, now: Date) {
  const ev = new ICAL.Event(v);
  const rid = v.getFirstProperty("recurrence-id")!;
  const original = rid.getFirstValue() as ICAL.Time;
  const notMoved = ev.startDate.compare(original) === 0;
  const ownLength = ev.duration.toSeconds();
  shiftProperty(rid, c.shift);
  if (c.title !== undefined && (ev.summary ?? "") === before.summary) ev.summary = c.title;
  if (c.location !== undefined && (ev.location ?? "") === before.location) {
    if (c.location) ev.location = c.location;
    else v.removeAllProperties("location");
  }
  if (c.memberIds && membersOf(v) === before.members) {
    if (c.memberIds.length) v.updatePropertyWithValue("x-kindo-members", c.memberIds.join(" "));
    else v.removeAllProperties("x-kindo-members");
  }
  let moved = false;
  if (notMoved && c.shift) {
    const length = ev.duration;
    ev.startDate = shifted(ev.startDate, c.shift);
    const end = ev.startDate.clone();
    end.addDuration(length);
    ev.endDate = end;
    moved = true;
  }
  if (c.length !== undefined && ownLength === before.length) {
    const end = ev.startDate.clone();
    if (end.isDate) end.adjust(c.length, 0, 0, 0);
    else end.adjust(0, 0, c.length, 0);
    ev.endDate = end;
    moved = true;
  }
  stamp(v, now, moved);
}

/** The occurrence's original start as the series writes it; SeriesChanged when the series doesn't have it (any more). */
function occurrenceTime(master: ICAL.Component, exceptions: ICAL.Component[], at: Date): ICAL.Time {
  const own = exceptions.find((x) => sameInstant(ridOf(x)!, at));
  if (own) return ridOf(own)!.clone();
  const ev = new ICAL.Event(master);
  const it = ev.iterator(skipAhead(ev, new Date(at.getTime() - DAY_MS)));
  for (let i = 0, next = it.next(); next && i < MAX_STEPS; i++, next = it.next()) {
    const d = dateOf(next);
    if (d.getTime() === at.getTime()) return next.clone();
    if (d > at) break;
  }
  throw new SeriesChanged("the occurrence is no longer part of its series");
}

function seriesParts(cal: ICAL.Component, uid: string) {
  const all = cal.getAllSubcomponents("vevent").filter((c) => c.getFirstPropertyValue("uid") === uid);
  const master = all.find((c) => !c.hasProperty("recurrence-id"));
  if (!master || (!master.hasProperty("rrule") && !master.hasProperty("rdate"))) throw new SeriesChanged("the series is gone from its calendar object");
  return { master, exceptions: all.filter((c) => c !== master) };
}

const copyOf = (c: ICAL.Component) => new ICAL.Component(JSON.parse(JSON.stringify(c.toJSON())));

/**
 * Ends a series before `rid`: COUNT shrinks to the occurrences before it,
 * otherwise UNTIL is set just before it. Returns, per RRULE, how many of its
 * occurrences are left after the cut (for the new series' COUNT), or null
 * where the rule has no COUNT.
 */
function endBefore(master: ICAL.Component, rid: ICAL.Time): (number | null)[] {
  const start = new ICAL.Event(master).startDate;
  const at = dateOf(rid);
  return master.getAllProperties("rrule").map((p) => {
    const rule = (p.getFirstValue() as ICAL.Recur).clone();
    let left: number | null = null;
    if (rule.count) {
      // COUNT counts what the rule makes, cancelled occurrences included (RFC 5545 §3.3.10).
      const it = rule.iterator(start);
      let before = 0;
      for (let next = it.next(); next && dateOf(next) < at && before < rule.count; next = it.next()) before++;
      left = rule.count - before;
      rule.count = before;
    } else {
      const until = rid.isDate ? rid.clone() : ICAL.Time.fromJSDate(new Date(at.getTime() - 1000), true);
      if (rid.isDate) until.adjust(-1, 0, 0, 0);
      rule.until = until;
    }
    p.setValue(rule);
    return left;
  });
}

/**
 * Changes or cancels part of a recurring series in one iCalendar object.
 * `e` null cancels: one occurrence (EXDATE), this and following (the series
 * ends before it), or the whole series (`text` null: the object goes).
 */
export function editSeriesIcs(text: string, t: SeriesTarget, scope: SeriesScope, e: EventToWrite | null, opts: { newUid?: string; now?: Date } = {}): SeriesResult {
  const now = opts.now ?? new Date();
  const cal = new ICAL.Component(ICAL.parse(text));
  registerTimezones(cal);
  const { master, exceptions } = seriesParts(cal, t.uid);
  const rid = occurrenceTime(master, exceptions, t.recurrenceId);
  const own = exceptions.find((x) => sameInstant(ridOf(x)!, t.recurrenceId));
  const first = new ICAL.Event(master).startDate;
  // "This and following" from the first occurrence is the whole series.
  if (scope === "following" && rid.compare(first) <= 0) scope = "series";

  if (scope === "occurrence") {
    if (!e) {
      if (own) cal.removeSubcomponent(own);
      const p = new ICAL.Property("exdate", master);
      setTime(p, rid);
      master.addProperty(p);
      stamp(master, now, true);
      return { text: cal.toString() };
    }
    let v = own;
    if (!v) {
      // A new exception: the series' own properties (description, alarms, attendees), at this occurrence.
      v = copyOf(master);
      for (const name of ["rrule", "rdate", "exdate", "exrule", "duration", "dtend"]) v.removeAllProperties(name);
      const ev = new ICAL.Event(v);
      const length = new ICAL.Event(master).duration;
      ev.startDate = rid.clone();
      const end = rid.clone();
      end.addDuration(length);
      ev.endDate = end;
      const p = new ICAL.Property("recurrence-id", v);
      setTime(p, rid);
      v.addProperty(p);
      cal.addSubcomponent(v);
    }
    editComponent(v, e, now);
    return { text: cal.toString() };
  }

  if (scope === "series" && !e) return { text: null };

  const before = {
    summary: String(master.getFirstPropertyValue("summary") ?? ""),
    location: String(master.getFirstPropertyValue("location") ?? ""),
    members: membersOf(master),
    length: new ICAL.Event(master).duration.toSeconds(),
  };
  const changes = e ? changesOf(first, t, e) : null;
  const carry = (v: ICAL.Component, edited: boolean) => {
    if (edited) {
      // The occurrence that was edited takes the edit as it is.
      shiftProperty(v.getFirstProperty("recurrence-id")!, changes!.shift);
      editComponent(v, e!, now);
    } else applyToException(v, changes!, before, now);
  };

  if (scope === "series") {
    const moved = applyToMaster(master, changes!);
    for (const name of ["exdate", "rdate"]) for (const p of master.getAllProperties(name)) shiftProperty(p, changes!.shift);
    stamp(master, now, moved);
    for (const x of exceptions) carry(x, x === own);
    return { text: cal.toString() };
  }

  // This and following: the series ends before the occurrence …
  const at = dateOf(rid);
  const later = (d: Date) => d >= at;
  const next = copyOf(master);
  const left = endBefore(master, rid);
  for (const name of ["exdate", "rdate"]) filterProperty(master, name, (d) => !later(d));
  const moving = exceptions.filter((x) => later(dateOf(ridOf(x)!)));
  for (const x of moving) cal.removeSubcomponent(x);
  stamp(master, now, true);
  if (!e) return { text: cal.toString() };

  // … and a new one starts there, with the later exceptions and cancellations.
  if (!opts.newUid) throw new Error("a new series needs a uid");
  next.updatePropertyWithValue("uid", opts.newUid);
  next.getAllProperties("rrule").forEach((p, i) => {
    const rule = (p.getFirstValue() as ICAL.Recur).clone();
    if (left[i] !== null) {
      if (left[i]! <= 0) return next.removeProperty(p);
      rule.count = left[i]!;
    }
    // An UNTIL in time must not cut off the last occurrence that now starts later.
    if (rule.until && !rule.until.isDate && changes!.shift > 0) rule.until.adjust(0, 0, changes!.shift, 0);
    p.setValue(rule);
  });
  for (const name of ["exdate", "rdate"]) filterProperty(next, name, later);
  const nev = new ICAL.Event(next);
  const length = nev.duration;
  const hadEnd = next.hasProperty("dtend");
  nev.startDate = rid.clone();
  if (hadEnd) {
    const end = rid.clone();
    end.addDuration(length);
    nev.endDate = end;
  }
  applyToMaster(next, changes!);
  for (const name of ["exdate", "rdate"]) for (const p of next.getAllProperties(name)) shiftProperty(p, changes!.shift);
  next.updatePropertyWithValue("sequence", 0);
  next.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(now, true));
  if (next.hasProperty("last-modified")) next.updatePropertyWithValue("last-modified", ICAL.Time.fromJSDate(now, true));

  const created = new ICAL.Component(["vcalendar", [], []]);
  for (const p of cal.getAllProperties()) created.addProperty(new ICAL.Property(JSON.parse(JSON.stringify(p.toJSON()))));
  for (const tz of cal.getAllSubcomponents("vtimezone")) created.addSubcomponent(copyOf(tz));
  created.addSubcomponent(next);
  for (const x of moving) {
    const v = copyOf(x);
    v.updatePropertyWithValue("uid", opts.newUid);
    carry(v, x === own);
    created.addSubcomponent(v);
  }
  return { text: cal.toString(), created: { uid: opts.newUid, text: created.toString() } };
}
