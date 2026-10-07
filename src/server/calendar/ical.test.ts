import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCalendar } from "./ical";
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
