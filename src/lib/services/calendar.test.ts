import { describe, expect, it } from "vitest";
import { calendarSelectors } from "./calendar";
import { addDays, at, sameDay, startOfDay } from "../dates";
import type { CalendarEvent } from "../types";

const today = startOfDay(new Date(2026, 9, 7));
const ev = (id: string, start: Date, hours = 1, extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, title: id, start, end: new Date(start.getTime() + hours * 3_600_000), memberIds: [], sourceId: "s", ...extra });

const events = [
  ev("today-1", at(today, 10)), ev("today-2", at(today, 18)),
  ...Array.from({ length: 8 }, (_, i) => ev(`later-${i}`, at(addDays(today, i + 1), 9))),
  ev("school", at(addDays(today, 1), 8), 5, { background: true }),
];
const cal = calendarSelectors([], events);

describe("upcoming", () => {
  it("skips today's events before applying the limit", () => {
    const items = cal.upcoming(at(today, 9), 14, 6, { afterToday: true });
    expect(items).toHaveLength(6);
    expect(items.some((e) => sameDay(e.start, today))).toBe(false);
  });

  it("leaves out background attendance like school", () => {
    expect(cal.upcoming(at(today, 9), 14, 20).map((e) => e.id)).not.toContain("school");
  });
});

describe("eventsOn", () => {
  it("includes multi-day events on the days in between", () => {
    const trip = ev("trip", at(today, 12), 72);
    const c = calendarSelectors([], [trip]);
    expect(c.eventsOn(addDays(today, 1))).toHaveLength(1);
    expect(c.eventsOn(addDays(today, 4))).toHaveLength(0);
  });

  it("filters by member but always keeps whole-family events", () => {
    const c = calendarSelectors([], [ev("a", at(today, 9), 1, { memberIds: ["anna"] }), ev("fam", at(today, 10))]);
    expect(c.eventsOn(today, new Set(["max"])).map((e) => e.id)).toEqual(["fam"]);
  });
});
