import { describe, expect, it } from "vitest";
import { nextOccurrence, upcomingDates } from "./dates-important";
import type { ImportantDate } from "./types";

const today = new Date(2026, 9, 7);
const d = (date: string, extra: Partial<ImportantDate> = {}): ImportantDate => ({ id: date, kind: "birthday", title: "x", date, yearly: true, ...extra });

describe("nextOccurrence", () => {
  it("finds this year's birthday and counts the age", () => {
    expect(nextOccurrence(d("2018-10-19"), today)).toMatchObject({ next: new Date(2026, 9, 19), turns: 8 });
  });

  it("rolls over to next year once the date has passed", () => {
    expect(nextOccurrence(d("1988-03-14"), today)).toMatchObject({ next: new Date(2027, 2, 14), turns: 39 });
  });

  it("today still counts as upcoming", () => {
    expect(nextOccurrence(d("2000-10-07"), today)?.next).toEqual(new Date(2026, 9, 7));
  });

  it("puts a 29 February birthday on 28 February in other years", () => {
    expect(nextOccurrence(d("2016-02-29"), today)?.next).toEqual(new Date(2027, 1, 28));
  });

  it("drops one-off dates once they have passed and never counts years for them", () => {
    expect(nextOccurrence(d("2026-10-01", { yearly: false, kind: "school" }), today)).toBeNull();
    expect(nextOccurrence(d("2026-10-16", { yearly: false, kind: "school" }), today)?.turns).toBeUndefined();
  });

  it("sorts what is coming soonest first", () => {
    expect(upcomingDates([d("1988-03-14"), d("2018-10-19")], today).map((x) => x.id)).toEqual(["2018-10-19", "1988-03-14"]);
  });
});
