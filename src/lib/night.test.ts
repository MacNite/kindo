import { describe, expect, it } from "vitest";
import { DEFAULT_NIGHT, isNightAt } from "./night";

const at = (h: number, m = 0) => new Date(2026, 9, 9, h, m);
const night = { on: true, from: "22:00", until: "06:00" };

describe("isNightAt", () => {
  it("is never night while off", () => {
    expect(isNightAt(at(23), DEFAULT_NIGHT)).toBe(false);
  });

  it("spans midnight when the end is earlier than the start", () => {
    expect([21, 22, 23, 0, 5, 6, 12].map((h) => isNightAt(at(h), night))).toEqual([false, true, true, true, true, false, false]);
    expect(isNightAt(at(21, 59), night)).toBe(false);
    expect(isNightAt(at(5, 59), night)).toBe(true);
  });

  it("works within one day too", () => {
    const nap = { on: true, from: "13:00", until: "15:00" };
    expect([12, 13, 14, 15].map((h) => isNightAt(at(h), nap))).toEqual([false, true, true, false]);
  });

  it("is empty when start and end are the same", () => {
    expect(isNightAt(at(22), { on: true, from: "22:00", until: "22:00" })).toBe(false);
  });

  it("follows the household's time zone", () => {
    // 21:30 UTC is 23:30 in Berlin (summer time), 17:30 in New York.
    const now = new Date(Date.UTC(2026, 6, 1, 21, 30));
    expect(isNightAt(now, night, "Europe/Berlin")).toBe(true);
    expect(isNightAt(now, night, "America/New_York")).toBe(false);
  });
});
