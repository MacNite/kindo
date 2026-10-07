import { describe, expect, it } from "vitest";
import { occursOn, toRRule } from "./recurrence";
import type { Recurrence } from "./types";

// 2026-10-05 is a Monday.
const day = (d: number) => new Date(2026, 9, d);

describe("occursOn", () => {
  it("daily matches every day", () => {
    for (let d = 5; d <= 11; d++) expect(occursOn({ kind: "daily" }, day(d))).toBe(true);
  });

  it("selected weekdays match only those days", () => {
    const r: Recurrence = { kind: "weekdays", days: [1, 3, 5] };
    expect([5, 6, 7, 8, 9, 10, 11].map((d) => occursOn(r, day(d)))).toEqual([true, false, true, false, true, false, false]);
  });

  it("weekly matches one weekday", () => {
    const r: Recurrence = { kind: "weekly", day: 2, interval: 1 };
    expect(occursOn(r, day(6))).toBe(true);
    expect(occursOn(r, day(13))).toBe(true);
    expect(occursOn(r, day(7))).toBe(false);
  });

  it("every two weeks alternates", () => {
    const r: Recurrence = { kind: "weekly", day: 6, interval: 2 };
    const hits = [10, 17, 24, 31].map((d) => occursOn(r, day(d)));
    expect(hits.filter(Boolean)).toHaveLength(2);
    expect(hits[0]).not.toBe(hits[1]);
    expect(hits[0]).toBe(hits[2]);
  });

  it("monthly matches the day of month", () => {
    expect(occursOn({ kind: "monthly", dayOfMonth: 7 }, day(7))).toBe(true);
    expect(occursOn({ kind: "monthly", dayOfMonth: 7 }, day(8))).toBe(false);
  });

  it("once matches exactly one date", () => {
    expect(occursOn({ kind: "once", date: "2026-10-07" }, day(7))).toBe(true);
    expect(occursOn({ kind: "once", date: "2026-10-07" }, day(14))).toBe(false);
  });

  it("school days skip weekends and honour a holiday calendar", () => {
    expect(occursOn({ kind: "schoolDays" }, day(10))).toBe(false);
    expect(occursOn({ kind: "schoolDays" }, day(9))).toBe(true);
    const holidays = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5 && d.getDate() !== 9;
    expect(occursOn({ kind: "schoolDays" }, day(9), holidays)).toBe(false);
  });
});

describe("toRRule", () => {
  it("maps to RFC 5545 rules", () => {
    expect(toRRule({ kind: "daily" })).toBe("FREQ=DAILY");
    expect(toRRule({ kind: "weekdays", days: [1, 5] })).toBe("FREQ=WEEKLY;BYDAY=MO,FR");
    expect(toRRule({ kind: "weekly", day: 6, interval: 2 })).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=SA");
    expect(toRRule({ kind: "monthly", dayOfMonth: 15 })).toBe("FREQ=MONTHLY;BYMONTHDAY=15");
  });
});
