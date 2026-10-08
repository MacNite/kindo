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

describe("routineFor", () => {
  const step = (id: string) => ({ id, pictogram: "book", label: "", value: { kind: "expected" as const } });
  const data = {
    holidays: [],
    routines: [
      { id: "daily", memberId: "f", period: "morning", recurrence: { kind: "daily" }, items: [step("teeth"), step("dress")] },
      { id: "school", memberId: "f", period: "morning", recurrence: { kind: "schoolDays" }, items: [step("bag")] },
      { id: "evening", memberId: "f", period: "evening", recurrence: { kind: "daily" }, items: [step("bath")] },
    ],
  } as unknown as HouseholdData;
  const { routineFor } = householdSelectors(data);

  it("joins every routine due in a period into one morning (D43)", () => {
    expect(routineFor("f", "morning", new Date(2026, 9, 5))?.items.map((i) => i.id)).toEqual(["teeth", "dress", "bag"]);
  });

  it("leaves out what isn't due that day", () => {
    expect(routineFor("f", "morning", new Date(2026, 9, 10))?.items.map((i) => i.id)).toEqual(["teeth", "dress"]);
    expect(routineFor("f", "afternoon", new Date(2026, 9, 10))).toBeUndefined();
  });
});
