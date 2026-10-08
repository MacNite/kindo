import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCalendar, updateEventIcs } from "./ical";
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
