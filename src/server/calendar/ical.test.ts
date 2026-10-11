import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SeriesChanged, SeriesEditRefused, editSeriesIcs, parseCalendar, updateEventIcs, type EventToWrite, type SeriesTarget } from "./ical";
import { holidayRanges } from "../holidays";

const ics = readFileSync(new URL("../../../tests/fixtures/school.ics", import.meta.url), "utf8");
const window = { from: new Date(2026, 9, 1), to: new Date(2026, 11, 31) };

describe("parseCalendar", () => {
  const events = parseCalendar(ics, window);

  it("keeps all-day events as dates at UTC midnight with an exclusive end (§20 D17)", () => {
    const autumn = events.find((e) => e.uid === "autumn@school")!;
    expect(autumn).toMatchObject({ allDay: true, recurring: false });
    expect(autumn.start.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(autumn.end.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("gives an all-day event without DTEND one day", () => {
    const unity = events.find((e) => e.uid === "unity@school")!;
    expect(unity.end.toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });

  it("expands recurring events with their time zone, EXDATEs and moved occurrences", () => {
    const football = events.filter((e) => e.uid === "football@family");
    // 10 Wednesdays from 7 Oct, minus 21 Oct; all within the window.
    expect(football).toHaveLength(9);
    expect(football[0].start.toISOString()).toBe("2026-10-07T14:30:00.000Z"); // 16:30 CEST
    const moved = football.find((e) => e.summary.includes("late"))!;
    expect(moved.start.toISOString()).toBe("2026-10-14T15:00:00.000Z");
    expect(football.some((e) => e.start.toISOString().startsWith("2026-10-21"))).toBe(false);
    // After the DST change, 16:30 is 15:30 UTC.
    expect(football.find((e) => e.start.toISOString().startsWith("2026-10-28"))!.start.toISOString()).toBe("2026-10-28T15:30:00.000Z");
    expect(football.every((e) => e.recurring)).toBe(true);
    expect(football[0].memberIds).toEqual(["lena", "max"]);
    expect(football[0].location).toBe("TSV Sportplatz");
  });

  it("only returns what touches the window", () => {
    const narrow = parseCalendar(ics, { from: new Date(2026, 9, 26), to: new Date(2026, 9, 27) });
    expect(narrow.map((e) => e.uid)).toEqual(["autumn@school"]);
  });
});

describe("long-running series", () => {
  const vtimezone = ics.slice(ics.indexOf("BEGIN:VTIMEZONE"), ics.indexOf("END:VTIMEZONE") + "END:VTIMEZONE".length);
  const calendar = (...lines: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", vtimezone, "BEGIN:VEVENT", ...lines, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
  const days = (d: Date) => Math.round((d.getTime() - window.from.getTime()) / 86_400_000);

  it("still reaches the window for a daily series that began in 2015", () => {
    const text = calendar("UID:walk@family", "DTSTART;TZID=Europe/Berlin:20150101T073000", "DTEND;TZID=Europe/Berlin:20150101T080000",
      "RRULE:FREQ=DAILY", "EXDATE;TZID=Europe/Berlin:20261103T073000", "SUMMARY:Dog walk");
    const walks = parseCalendar(text, window);
    // 1 Oct to 30 Dec 2026 (the window ends at the start of the 31st), minus the EXDATE.
    expect(walks).toHaveLength(days(window.to) - 1);
    expect(walks[0].start.toISOString()).toBe("2026-10-01T05:30:00.000Z"); // 07:30 CEST
    expect(walks.at(-1)!.start.toISOString()).toBe("2026-12-30T06:30:00.000Z"); // 07:30 CET
    expect(walks.some((w) => w.start.toISOString().startsWith("2026-11-03"))).toBe(false);
  });

  it("keeps a fortnightly rhythm and its weekdays when skipping ahead", () => {
    const text = calendar("UID:bins@family", "DTSTART;VALUE=DATE:20120103", "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,FR", "SUMMARY:Bins");
    const bins = parseCalendar(text, window);
    const first = new Date(Date.UTC(2012, 0, 3));
    for (const b of bins) {
      const offset = Math.round((b.start.getTime() - first.getTime()) / 86_400_000);
      // Tuesdays (offset 0) and Fridays (offset 3) of every other week from the first.
      expect([0, 3]).toContain(offset % 14);
    }
    expect(bins).toHaveLength(13);
  });
});

const vtimezoneOf = (text: string) => text.slice(text.indexOf("BEGIN:VTIMEZONE"), text.indexOf("END:VTIMEZONE") + "END:VTIMEZONE".length);
const calendarOf = (...lines: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", vtimezoneOf(ics), "BEGIN:VEVENT", ...lines, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");

describe("updateEventIcs", () => {
  const vtimezone = ics.slice(ics.indexOf("BEGIN:VTIMEZONE"), ics.indexOf("END:VTIMEZONE") + "END:VTIMEZONE".length);
  const original = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nextcloud//EN", vtimezone, "BEGIN:VEVENT", "UID:dentist@elsewhere",
    "DTSTAMP:20261001T080000Z", "SEQUENCE:2", "DTSTART;TZID=Europe/Berlin:20261012T090000", "DTEND;TZID=Europe/Berlin:20261012T100000",
    "SUMMARY:Dentist", "LOCATION:Praxis", "DESCRIPTION:Bring the insurance card", "CATEGORIES:Health", "X-OTHER-APP:keep me",
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT30M", "DESCRIPTION:Reminder", "END:VALARM", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
  const edit = { uid: "dentist@elsewhere", title: "Dentist (Max)", start: new Date("2026-10-12T07:00:00Z"), end: new Date("2026-10-12T08:00:00Z"), allDay: false, memberIds: ["max"] };
  const one = (text: string) => parseCalendar(text, window)[0];

  it("changes what Kindo edits and keeps everything else", () => {
    const text = updateEventIcs(original, { ...edit, location: "Praxis Dr. Weiß" });
    expect(text).toContain("DESCRIPTION:Bring the insurance card");
    expect(text).toContain("CATEGORIES:Health");
    expect(text).toContain("X-OTHER-APP:keep me");
    expect(text).toContain("BEGIN:VALARM");
    expect(text).toContain("SEQUENCE:2"); // the time didn't move
    expect(text).toContain("DTSTART;TZID=Europe/Berlin:20261012T090000");
    expect(one(text)).toMatchObject({ summary: "Dentist (Max)", location: "Praxis Dr. Weiß", memberIds: ["max"] });
  });

  it("moves the time in the event's own time zone and clears what was cleared", () => {
    const text = updateEventIcs(original, { ...edit, start: new Date("2026-10-13T12:00:00Z"), end: new Date("2026-10-13T13:30:00Z"), memberIds: [] });
    expect(text).toContain("DTSTART;TZID=Europe/Berlin:20261013T140000");
    expect(text).toContain("DTEND;TZID=Europe/Berlin:20261013T153000");
    expect(text).toContain("SEQUENCE:3");
    expect(text).not.toContain("LOCATION");
    expect(text).not.toContain("X-KINDO-MEMBERS");
    expect(text).toContain("DESCRIPTION:Bring the insurance card");
    expect(one(text).start.toISOString()).toBe("2026-10-13T12:00:00.000Z");
  });

  it("turns a timed event into a whole day", () => {
    const text = updateEventIcs(original, { ...edit, allDay: true, start: new Date("2026-10-12T00:00:00Z"), end: new Date("2026-10-13T00:00:00Z") });
    expect(text).toContain("DTSTART;VALUE=DATE:20261012");
    expect(text).toContain("DTEND;VALUE=DATE:20261013");
    expect(one(text)).toMatchObject({ allDay: true });
  });
});

describe("editing a recurring series (D70)", () => {
  // Football: Wednesdays 16:30–18:00 Berlin time from 7 Oct, COUNT=10, 21 Oct cancelled,
  // 14 Oct moved to 17:00 ("late"). Daylight saving ends on 25 Oct, between 14 and 28 Oct.
  const football = ics;
  const all = (text: string) => parseCalendar(text, window).filter((e) => e.uid.startsWith("football") || e.uid === "next@kindo");
  const occ = (text: string, day: string) => all(text).find((e) => e.start.toISOString().startsWith(day))!;
  const shown = (day: string): SeriesTarget => {
    const e = occ(football, day);
    return { uid: "football@family", recurrenceId: e.recurrenceId!, shown: { uid: e.uid, title: e.summary, start: e.start, end: e.end, allDay: false, location: e.location, memberIds: e.memberIds ?? [] } };
  };
  const edit = (t: SeriesTarget, patch: Partial<EventToWrite>): EventToWrite => ({ ...t.shown, ...patch });
  const at = (iso: string) => new Date(iso);
  const now = new Date("2026-10-11T12:00:00Z");

  it("knows each occurrence's original start, also for a moved one", () => {
    expect(occ(football, "2026-10-28").recurrenceId!.toISOString()).toBe("2026-10-28T15:30:00.000Z");
    expect(occ(football, "2026-10-14").recurrenceId!.toISOString()).toBe("2026-10-14T14:30:00.000Z"); // 16:30, shown at 17:00
    expect(parseCalendar(ics, window).find((e) => e.uid === "autumn@school")!.recurrenceId).toBeUndefined();
  });

  it("changes one occurrence as an exception, in the series' time zone after daylight saving ends", () => {
    const t = shown("2026-10-28");
    // 17:00 CET is 16:00 UTC (it was 15:00 UTC in October's CEST weeks).
    const { text, created } = editSeriesIcs(football, t, "occurrence", edit(t, { title: "Football (Max)", start: at("2026-10-28T16:00:00Z"), end: at("2026-10-28T17:30:00Z"), memberIds: ["max"] }), { now });
    expect(created).toBeUndefined();
    expect(text).toContain("RECURRENCE-ID;TZID=Europe/Berlin:20261028T163000");
    expect(text).toContain("DTSTART;TZID=Europe/Berlin:20261028T170000");
    const events = all(text!);
    expect(events).toHaveLength(9);
    expect(occ(text!, "2026-10-28")).toMatchObject({ summary: "Football (Max)", memberIds: ["max"], location: "TSV Sportplatz" });
    // The rest of the series is untouched, the earlier exception and the cancellation too.
    expect(occ(text!, "2026-11-04")).toMatchObject({ summary: "Football practice", memberIds: ["lena", "max"] });
    expect(occ(text!, "2026-11-04").start.toISOString()).toBe("2026-11-04T15:30:00.000Z");
    expect(occ(text!, "2026-10-14").summary).toBe("Football practice (late)");
    expect(events.some((e) => e.start.toISOString().startsWith("2026-10-21"))).toBe(false);
  });

  it("changes an occurrence that already is an exception in place, without a second one", () => {
    const t = shown("2026-10-14");
    const { text } = editSeriesIcs(football, t, "occurrence", edit(t, { title: "Football (later still)", start: at("2026-10-14T15:30:00Z"), end: at("2026-10-14T17:00:00Z") }), { now });
    expect(text!.match(/RECURRENCE-ID/g)).toHaveLength(1);
    expect(occ(text!, "2026-10-14")).toMatchObject({ summary: "Football (later still)" });
    expect(occ(text!, "2026-10-14").start.toISOString()).toBe("2026-10-14T15:30:00.000Z");
    expect(all(text!)).toHaveLength(9);
  });

  it("cancels one occurrence with an EXDATE at its original time, dropping its exception", () => {
    const moved = editSeriesIcs(football, shown("2026-10-14"), "occurrence", null, { now }).text!;
    expect(moved).not.toContain("RECURRENCE-ID");
    expect(moved).toContain("EXDATE;TZID=Europe/Berlin:20261014T163000");
    expect(all(moved)).toHaveLength(8);
    const plain = editSeriesIcs(football, shown("2026-11-04"), "occurrence", null, { now }).text!;
    expect(all(plain).map((e) => e.start.toISOString().slice(0, 10))).not.toContain("2026-11-04");
    expect(all(plain)).toHaveLength(8);
  });

  it("moves the whole series by wall-clock time across daylight saving, keeping its exceptions", () => {
    // Edited on a winter occurrence: 16:30 → 17:00 CET.
    const t = shown("2026-10-28");
    const { text } = editSeriesIcs(football, t, "series", edit(t, { start: at("2026-10-28T16:00:00Z"), end: at("2026-10-28T17:30:00Z") }), { now });
    expect(text).toContain("DTSTART;TZID=Europe/Berlin:20261007T170000");
    const events = all(text!);
    expect(events).toHaveLength(9);
    // 17:00 in summer time and in winter time alike.
    expect(occ(text!, "2026-10-07").start.toISOString()).toBe("2026-10-07T15:00:00.000Z");
    expect(occ(text!, "2026-11-04").start.toISOString()).toBe("2026-11-04T16:00:00.000Z");
    // The cancelled 21 Oct stays cancelled; the moved 14 Oct keeps its own time and title.
    expect(text).toContain("EXDATE;TZID=Europe/Berlin:20261021T170000");
    expect(events.some((e) => e.start.toISOString().startsWith("2026-10-21"))).toBe(false);
    expect(text).toContain("RECURRENCE-ID;TZID=Europe/Berlin:20261014T170000");
    expect(occ(text!, "2026-10-14")).toMatchObject({ summary: "Football practice (late)" });
    expect(occ(text!, "2026-10-14").start.toISOString()).toBe("2026-10-14T15:00:00.000Z");
  });

  it("renames the series and the exceptions that had its name, not those with their own", () => {
    const t = shown("2026-11-04");
    const withPlain = editSeriesIcs(football, shown("2026-11-11"), "occurrence", edit(shown("2026-11-11"), { memberIds: ["lena"] }), { now }).text!;
    const { text } = editSeriesIcs(withPlain, t, "series", edit(t, { title: "Football" }), { now });
    expect(all(text!).filter((e) => e.summary === "Football")).toHaveLength(8);
    expect(occ(text!, "2026-10-14").summary).toBe("Football practice (late)");
    // The exception keeps its own people.
    expect(occ(text!, "2026-11-11")).toMatchObject({ summary: "Football", memberIds: ["lena"] });
    expect(text).toContain("DTSTART;TZID=Europe/Berlin:20261007T163000"); // the time didn't change
  });

  it("refuses to move several occurrences to another day or to all-day", () => {
    const t = shown("2026-11-04");
    expect(() => editSeriesIcs(football, t, "series", edit(t, { start: at("2026-11-05T15:30:00Z"), end: at("2026-11-05T17:00:00Z") }))).toThrow(SeriesEditRefused);
    expect(() => editSeriesIcs(football, t, "following", edit(t, { allDay: true }))).toThrow(SeriesEditRefused);
  });

  it("splits at this and following: the old series stops, a new one carries on with the rest", () => {
    const t = shown("2026-11-04");
    const { text, created } = editSeriesIcs(football, t, "following", edit(t, { title: "Football (winter)", start: at("2026-11-04T16:00:00Z"), end: at("2026-11-04T17:30:00Z") }), { newUid: "next@kindo", now });
    // COUNT=10 from 7 Oct: four before 4 Nov (21 Oct counts though it was cancelled), six from it.
    expect(text).toMatch(/RRULE:FREQ=WEEKLY;(COUNT=4;BYDAY=WE|BYDAY=WE;COUNT=4)/);
    expect(created!.text).toMatch(/RRULE:FREQ=WEEKLY;(COUNT=6;BYDAY=WE|BYDAY=WE;COUNT=6)/);
    expect(created!.text).toContain("BEGIN:VTIMEZONE");
    const before = all(text!), after = all(created!.text);
    expect(before.map((e) => e.start.toISOString().slice(0, 10))).toEqual(["2026-10-07", "2026-10-14", "2026-10-28"]);
    expect(before.every((e) => e.uid === "football@family")).toBe(true);
    expect(after).toHaveLength(6);
    expect(after.every((e) => e.uid === "next@kindo" && e.summary === "Football (winter)")).toBe(true);
    expect(after[0].start.toISOString()).toBe("2026-11-04T16:00:00.000Z");
    expect(after[0]).toMatchObject({ location: "TSV Sportplatz", memberIds: ["lena", "max"] });
  });

  it("takes later exceptions and cancellations into the new series, with an UNTIL rule", () => {
    const untilSeries = football.replace("RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=10", "RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20261209T153000Z");
    const t = shown("2026-10-14");
    const target = { ...t, shown: { ...t.shown, start: occ(untilSeries, "2026-10-14").start } };
    // From 14 Oct (moved to 17:00) on, at 16:00: the new series' time, not "an hour earlier".
    const { text, created } = editSeriesIcs(untilSeries, target, "following", { ...target.shown, start: at("2026-10-14T14:00:00Z"), end: at("2026-10-14T15:30:00Z") }, { newUid: "next@kindo", now });
    expect(text).toContain("UNTIL=20261014T142959Z");
    expect(text).not.toContain("RECURRENCE-ID");
    expect(text).not.toContain("EXDATE");
    expect(all(text!)).toHaveLength(1);
    // The new series: the edited exception, the cancellation moved along with the series' time, 9 Dec still in.
    expect(created!.text).toContain("DTSTART;TZID=Europe/Berlin:20261014T160000");
    expect(created!.text).toContain("RECURRENCE-ID;TZID=Europe/Berlin:20261014T160000");
    expect(created!.text).toContain("EXDATE;TZID=Europe/Berlin:20261021T160000");
    const after = all(created!.text);
    expect(after.some((e) => e.start.toISOString().startsWith("2026-10-21"))).toBe(false);
    expect(after.find((e) => e.start.toISOString().startsWith("2026-10-14"))!.start.toISOString()).toBe("2026-10-14T14:00:00.000Z");
    expect(after.find((e) => e.start.toISOString().startsWith("2026-11-04"))!.start.toISOString()).toBe("2026-11-04T15:00:00.000Z");
    expect(after.at(-1)!.start.toISOString()).toBe("2026-12-09T15:00:00.000Z");
    // 14 Oct to 9 Dec is nine Wednesdays, without the cancelled one.
    expect(after).toHaveLength(8);
  });

  it("cancels this and following by ending the series, and the whole series from its first", () => {
    const { text, created } = editSeriesIcs(football, shown("2026-11-04"), "following", null, { now });
    expect(created).toBeUndefined();
    expect(all(text!)).toHaveLength(3);
    expect(editSeriesIcs(football, shown("2026-10-07"), "following", null, { now }).text).toBeNull();
    expect(editSeriesIcs(football, shown("2026-11-04"), "series", null, { now }).text).toBeNull();
  });

  it("an all-day series ends the day before with a date UNTIL", () => {
    const bins = calendarOf("UID:bins@family", "DTSTART;VALUE=DATE:20261006", "DTEND;VALUE=DATE:20261007", "RRULE:FREQ=WEEKLY;BYDAY=TU", "SUMMARY:Bins");
    const tue = parseCalendar(bins, window)[3];
    const t = { uid: "bins@family", recurrenceId: tue.recurrenceId!, shown: { uid: "bins@family", title: "Bins", start: tue.start, end: tue.end, allDay: true, memberIds: [] } };
    const { text, created } = editSeriesIcs(bins, t, "following", { ...t.shown, title: "Bins (new day)" }, { newUid: "next@kindo", now });
    expect(text).toContain("UNTIL=20261026");
    expect(parseCalendar(text!, window)).toHaveLength(3);
    expect(parseCalendar(created!.text, window)[0]).toMatchObject({ summary: "Bins (new day)", allDay: true });
  });

  it("notices when the occurrence is no longer in the series", () => {
    const t = shown("2026-11-04");
    // Someone cancelled it in another app since Kindo last synced.
    const cancelled = editSeriesIcs(football, t, "occurrence", null, { now }).text!;
    expect(() => editSeriesIcs(cancelled, t, "occurrence", edit(t, { title: "x" }))).toThrow(SeriesChanged);
    expect(() => editSeriesIcs(football, { ...t, recurrenceId: at("2026-11-05T15:30:00Z") }, "series", null)).toThrow(SeriesChanged);
    expect(() => editSeriesIcs(football, { ...t, uid: "gone@family" }, "occurrence", null)).toThrow(SeriesChanged);
  });
});

describe("holidayRanges", () => {
  it("turns holiday events into inclusive date ranges", () => {
    const ranges = holidayRanges(parseCalendar(ics, window).filter((e) => e.uid.endsWith("@school")));
    expect(ranges).toEqual([
      { start: "2026-10-03", end: "2026-10-03", summary: "Tag der Deutschen Einheit" },
      { start: "2026-10-26", end: "2026-10-30", summary: "Herbstferien" },
      { start: "2026-12-23", end: "2027-01-08", summary: "Weihnachtsferien" },
    ]);
  });
});
