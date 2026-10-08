import { describe, expect, it } from "vitest";
import { daysUntil, monthGrid, startOfWeek, wallClockIn } from "./dates";

describe("wallClockIn", () => {
  it("reads the time as a clock in another time zone shows it", () => {
    // Tests run in Europe/Berlin; 12:00 UTC on 7 July is 08:00 in New York and 21:00 in Tokyo.
    const noonUtc = new Date(Date.UTC(2026, 6, 7, 12, 0));
    expect(wallClockIn(noonUtc, "America/New_York")).toEqual(new Date(2026, 6, 7, 8, 0));
    expect(wallClockIn(noonUtc, "Asia/Tokyo")).toEqual(new Date(2026, 6, 7, 21, 0));
    expect(wallClockIn(noonUtc, "Europe/Berlin")).toEqual(new Date(2026, 6, 7, 14, 0));
  });
  it("crosses midnight into the zone's own date", () => {
    expect(wallClockIn(new Date(Date.UTC(2026, 6, 7, 23, 30)), "Asia/Tokyo")).toEqual(new Date(2026, 6, 8, 8, 30));
  });
  it("falls back to the device's clock without a valid zone", () => {
    const now = new Date(2026, 6, 7, 10, 15);
    expect(wallClockIn(now)).toBe(now);
    expect(wallClockIn(now, "Not/AZone")).toBe(now);
  });
});

describe("startOfWeek", () => {
  const wed = new Date(2026, 9, 7, 15, 30);
  it("goes back to Monday for Monday-start regions", () => {
    expect(startOfWeek(wed, 1)).toEqual(new Date(2026, 9, 5));
  });
  it("goes back to Sunday for Sunday-start regions", () => {
    expect(startOfWeek(wed, 0)).toEqual(new Date(2026, 9, 4));
  });
});

describe("monthGrid", () => {
  it("has six full weeks starting on the week start", () => {
    const grid = monthGrid(new Date(2026, 9, 1), 1);
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(1);
    expect(grid.some((d) => d.getMonth() === 9 && d.getDate() === 31)).toBe(true);
  });
});

describe("daysUntil", () => {
  it("counts calendar days, ignoring the time of day", () => {
    expect(daysUntil(new Date(2026, 9, 7, 23, 0), new Date(2026, 9, 8, 1, 0))).toBe(1);
  });
  it("is not thrown off by the end of daylight saving time", () => {
    expect(daysUntil(new Date(2026, 9, 24), new Date(2026, 9, 26))).toBe(2);
  });
});
