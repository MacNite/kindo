import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMES, currentPeriod, fromRRule, householdDay, householdDayIn, householdDayKeyIn, nextOccurrences, normalizeRecurrence, occurrences, occursOn, sameRecurrence, schoolDaysFrom,
  toICalLines, toRRule,
} from "./recurrence";
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
    expect(toRRule({ kind: "weekdays", days: [5, 1] })).toBe("FREQ=WEEKLY;BYDAY=MO,FR");
    expect(toRRule({ kind: "weekly", day: 6, interval: 2 })).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=SA");
    expect(toRRule({ kind: "weekly", day: 2, interval: 1 })).toBe("FREQ=WEEKLY;BYDAY=TU");
    expect(toRRule({ kind: "monthly", dayOfMonth: 15 })).toBe("FREQ=MONTHLY;BYMONTHDAY=15");
    expect(toRRule({ kind: "once", date: "2026-10-07" })).toBe("FREQ=DAILY;COUNT=1");
  });

  it("anchors the rule on a DTSTART that matches the phase of every-N-weeks", () => {
    expect(toICalLines({ kind: "weekly", day: 6, interval: 2, from: "2026-10-10" })).toEqual(["DTSTART;VALUE=DATE:20261010", "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA"]);
    expect(toICalLines({ kind: "once", date: "2026-10-07" })[0]).toBe("DTSTART;VALUE=DATE:20261007");
  });
});

describe("fromRRule round-trips every kind Kindo writes (§7)", () => {
  const year = (r: Recurrence) => occurrences(r, new Date(2026, 0, 1), new Date(2026, 11, 31)).map((d) => d.getTime());
  const kinds: Recurrence[] = [
    { kind: "daily" },
    { kind: "weekdays", days: [1, 3, 5] },
    { kind: "weekly", day: 2, interval: 1 },
    { kind: "weekly", day: 6, interval: 2, from: "2026-01-10" },
    { kind: "weekly", day: 6, interval: 3 },
    { kind: "monthly", dayOfMonth: 15 },
    { kind: "monthly", dayOfMonth: 31 },
    { kind: "once", date: "2026-10-07" },
  ];
  for (const r of kinds) {
    it(`${JSON.stringify(r)}`, () => {
      const [dtstart, rrule] = toICalLines(r);
      const back = fromRRule(rrule, dtstart.split(":")[1]);
      expect(back).not.toBeNull();
      expect(year(back!)).toEqual(year(r));
    });
  }

  it("school days come back as weekdays (the holidays travel as EXDATEs)", () => {
    expect(fromRRule(toRRule({ kind: "schoolDays" }), "20240101")).toEqual({ kind: "weekdays", days: [1, 2, 3, 4, 5] });
  });

  it("refuses rules Kindo can't represent", () => {
    expect(fromRRule("FREQ=MONTHLY;BYDAY=2TU", "20260101")).toBeNull();
    expect(fromRRule("FREQ=DAILY;INTERVAL=3", "20260101")).toBeNull();
    expect(fromRRule("FREQ=WEEKLY;UNTIL=20261231", "20260101")).toBeNull();
    expect(fromRRule("FREQ=YEARLY", "20260101")).toBeNull();
  });
});

describe("occurrences (§19.3)", () => {
  it("lists every date in a range", () => {
    expect(occurrences({ kind: "weekdays", days: [1, 3] }, day(5), day(18)).map((d) => d.getDate())).toEqual([5, 7, 12, 14]);
  });

  it("once falls inside or outside a range", () => {
    expect(occurrences({ kind: "once", date: "2026-10-07" }, day(1), day(31))).toEqual([day(7)]);
    expect(occurrences({ kind: "once", date: "2026-10-07" }, day(8), day(31))).toEqual([]);
  });

  it("finds the next few dates", () => {
    expect(nextOccurrences({ kind: "weekly", day: 5, interval: 1 }, day(7), 3)).toEqual([day(9), day(16), day(23)]);
  });

  it("every N weeks starts on its own date and keeps its phase", () => {
    const r: Recurrence = { kind: "weekly", day: 6, interval: 2, from: "2026-10-17" };
    expect(occursOn(r, day(10))).toBe(false); // before the start
    expect(occursOn(r, day(17))).toBe(true);
    expect(occursOn(r, day(24))).toBe(false);
    expect(occursOn(r, day(31))).toBe(true);
  });

  it("day 31 lands on the last day of shorter months", () => {
    const r: Recurrence = { kind: "monthly", dayOfMonth: 31 };
    expect(occursOn(r, new Date(2026, 1, 28))).toBe(true);
    expect(occursOn(r, new Date(2026, 3, 30))).toBe(true);
    expect(occursOn(r, new Date(2026, 3, 29))).toBe(false);
  });
});

describe("school days from holiday feeds", () => {
  const isSchoolDay = schoolDaysFrom([{ start: "2026-10-26", end: "2026-10-30" }, { start: "2026-10-03", end: "2026-10-03" }]);
  it("are weekdays outside the holidays", () => {
    expect(isSchoolDay(day(23))).toBe(true);
    expect(isSchoolDay(day(26))).toBe(false);
    expect(isSchoolDay(day(30))).toBe(false);
    expect(isSchoolDay(new Date(2026, 10, 2))).toBe(true);
    expect(isSchoolDay(day(24))).toBe(false); // Saturday
  });
  it("drive the schoolDays recurrence", () => {
    expect(occurrences({ kind: "schoolDays" }, day(26), new Date(2026, 10, 3), isSchoolDay).map((d) => d.getDate())).toEqual([2, 3]);
  });
});

describe("the household day (§19.3)", () => {
  it("starts at the reset time, not at midnight", () => {
    expect(householdDay(new Date(2026, 9, 8, 0, 30), "03:00")).toEqual(day(7));
    expect(householdDay(new Date(2026, 9, 8, 3, 0), "03:00")).toEqual(day(8));
    expect(householdDay(new Date(2026, 9, 8, 0, 30))).toEqual(day(8));
  });

  it("is computed in the household's time zone on the server", () => {
    // 22:30 UTC is 00:30 the next day in Berlin (summer time): still the evening before with a 03:00 reset.
    expect(householdDayKeyIn(new Date(Date.UTC(2026, 6, 7, 22, 30)), "Europe/Berlin", "03:00")).toBe("2026-07-07");
    expect(householdDayKeyIn(new Date(Date.UTC(2026, 6, 7, 22, 30)), "Europe/Berlin", "00:00")).toBe("2026-07-08");
    expect(householdDayKeyIn(new Date(Date.UTC(2026, 6, 7, 22, 30)), "America/New_York", "03:00")).toBe("2026-07-07");
  });

  it("follows the household's time zone on a device set to another one (D52)", () => {
    // 06:30 UTC: 08:30 in Berlin (the device here), 02:30 in New York, before its 03:00 reset.
    const now = new Date(Date.UTC(2026, 6, 8, 6, 30));
    expect(householdDayIn(now, "America/New_York", "03:00")).toEqual(new Date(2026, 6, 7));
    expect(householdDayIn(now, "Europe/Berlin", "03:00")).toEqual(new Date(2026, 6, 8));
    expect(currentPeriod(now, DEFAULT_TIMES, "America/New_York")).toBe("evening");
    expect(currentPeriod(now, DEFAULT_TIMES, "Europe/Berlin")).toBe("morning");
    expect(currentPeriod(new Date(Date.UTC(2026, 6, 8, 14, 0)), DEFAULT_TIMES, "America/New_York")).toBe("morning");
  });

  it("decides which routine is current", () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 7, h, m);
    expect(currentPeriod(at(1))).toBe("evening");
    expect(currentPeriod(at(6))).toBe("morning");
    expect(currentPeriod(at(11))).toBe("afternoon");
    expect(currentPeriod(at(17))).toBe("evening");
    expect(currentPeriod(at(10), { dayStartsAt: "04:00", morningUntil: "09:30", afternoonUntil: "18:00" })).toBe("afternoon");
  });
});

describe("occursOn across daylight-saving changes", () => {
  it("every two weeks keeps alternating through a whole year", () => {
    const r: Recurrence = { kind: "weekly", day: 1, interval: 2 };
    // 2026-01-05 is a Monday; 52 Mondays span both DST switches in DST-observing zones.
    const hits = Array.from({ length: 52 }, (_, w) => occursOn(r, new Date(2026, 0, 5 + w * 7)));
    hits.forEach((h, w) => expect(h, `week ${w}`).toBe(hits[0] === (w % 2 === 0)));
  });
});

describe("recurrenceKey", () => {
  it("treats the same weekdays in any order as one rhythm", () => {
    expect(sameRecurrence({ kind: "weekdays", days: [5, 1, 3] }, { kind: "weekdays", days: [1, 3, 5, 3] })).toBe(true);
    expect(normalizeRecurrence({ kind: "weekdays", days: [5, 1, 3] })).toEqual({ kind: "weekdays", days: [1, 3, 5] });
  });

  it("all seven days are every day", () => {
    expect(sameRecurrence({ kind: "weekdays", days: [0, 1, 2, 3, 4, 5, 6] }, { kind: "daily" })).toBe(true);
  });

  it("keeps different rhythms apart", () => {
    expect(sameRecurrence({ kind: "weekdays", days: [1, 2, 3, 4, 5] }, { kind: "schoolDays" })).toBe(false);
    expect(sameRecurrence({ kind: "weekly", day: 6, interval: 2, from: "2026-10-10" }, { kind: "weekly", day: 6, interval: 2, from: "2026-10-17" })).toBe(false);
    expect(sameRecurrence({ kind: "monthly", dayOfMonth: 1 }, { kind: "monthly", dayOfMonth: 2 })).toBe(false);
  });
});
