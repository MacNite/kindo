import { describe, expect, it } from "vitest";
import { daysUntil, monthGrid, startOfWeek } from "./dates";

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
