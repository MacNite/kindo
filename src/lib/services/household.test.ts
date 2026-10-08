import { describe, expect, it } from "vitest";
import { householdSelectors } from "./household";
import type { HouseholdData } from "../types";

const holidays = [
  { start: "2026-10-17", end: "2026-10-31", summary: "Herbstferien" },
  { start: "2026-10-17", end: "2026-10-31", summary: "Herbstferien" },
  { start: "2026-10-31", end: "2026-10-31", summary: "Reformationstag" },
];
const { holidaysOn, isSchoolDay } = householdSelectors({ holidays } as unknown as HouseholdData);

describe("holidaysOn", () => {
  it("lists each holiday covering the day once, first and last day included", () => {
    expect(holidaysOn(new Date(2026, 9, 17)).map((h) => h.summary)).toEqual(["Herbstferien"]);
    expect(holidaysOn(new Date(2026, 9, 31)).map((h) => h.summary)).toEqual(["Herbstferien", "Reformationstag"]);
  });

  it("is empty outside the ranges, and agrees with the school days", () => {
    expect(holidaysOn(new Date(2026, 10, 2))).toEqual([]);
    expect(isSchoolDay(new Date(2026, 10, 2))).toBe(true);
    expect(isSchoolDay(new Date(2026, 9, 19))).toBe(false);
  });
});
