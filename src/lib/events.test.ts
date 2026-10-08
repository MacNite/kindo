import { describe, expect, it } from "vitest";
import { daySegment, endsNextDay, eventForm, eventTimes, moveStart } from "./events";

const d = (day: number, h = 0, m = 0) => new Date(2026, 9, day, h, m);

describe("the event editor's form", () => {
  it("keeps a multi-day all-day event's length (exclusive end, D17)", () => {
    const f = eventForm({ allDay: true, start: d(10), end: d(13) });
    expect(f).toMatchObject({ date: "2026-10-10", endDate: "2026-10-12" });
    expect(eventTimes(f)).toEqual({ start: d(10), end: d(13) });
  });

  it("keeps a timed event's end", () => {
    const f = eventForm({ allDay: false, start: d(10, 9, 30), end: d(10, 12, 15) });
    expect(f).toMatchObject({ date: "2026-10-10", endDate: "2026-10-10", from: "09:30", to: "12:15" });
    expect(eventTimes(f)).toEqual({ start: d(10, 9, 30), end: d(10, 12, 15) });
  });

  it("reads an end time before the start time as the next morning", () => {
    const f = { allDay: false, date: "2026-10-10", endDate: "2026-10-10", from: "22:00", to: "02:00" };
    expect(eventTimes(f)).toEqual({ start: d(10, 22), end: d(11, 2) });
    expect(endsNextDay(f)).toBe(true);
    expect(endsNextDay({ ...f, to: "23:00" })).toBe(false);
  });

  it("round-trips an overnight event and takes an explicit end date", () => {
    const f = eventForm({ allDay: false, start: d(10, 20), end: d(12, 10) });
    expect(f.endDate).toBe("2026-10-12");
    expect(eventTimes(f)).toEqual({ start: d(10, 20), end: d(12, 10) });
  });

  it("never ends before it starts", () => {
    expect(eventTimes({ allDay: true, date: "2026-10-10", endDate: "2026-10-08", from: "", to: "" })).toEqual({ start: d(10), end: d(11) });
    expect(eventTimes({ allDay: false, date: "2026-10-10", endDate: "2026-10-09", from: "10:00", to: "09:00" }).end).toEqual(d(11, 9));
  });

  it("moves the end along with the start", () => {
    const allDay = eventForm({ allDay: true, start: d(10), end: d(12) });
    expect(moveStart(allDay, { date: "2026-10-17" })).toMatchObject({ date: "2026-10-17", endDate: "2026-10-18" });
    const timed = eventForm({ allDay: false, start: d(10, 22), end: d(11, 1) });
    expect(moveStart(timed, { from: "23:00" })).toMatchObject({ endDate: "2026-10-11", to: "02:00" });
    expect(moveStart(timed, { date: "2026-10-20" })).toMatchObject({ date: "2026-10-20", endDate: "2026-10-21", to: "01:00" });
  });
});

describe("daySegment (the week view)", () => {
  it("cuts an event to the visible hours", () => {
    expect(daySegment({ start: d(10, 6), end: d(10, 8) }, d(10), 7, 22)).toEqual({ top: 420, bottom: 480, fromPrev: false, toNext: false });
    expect(daySegment({ start: d(10, 21), end: d(10, 23, 30) }, d(10), 7, 22)).toMatchObject({ top: 1260, bottom: 1320 });
    // Entirely before the visible hours: at the top edge, with no length, never negative.
    expect(daySegment({ start: d(10, 5), end: d(10, 6) }, d(10), 7, 22)).toMatchObject({ top: 420, bottom: 420 });
  });

  it("splits an overnight event across its days", () => {
    const e = { start: d(10, 20), end: d(11, 9) };
    expect(daySegment(e, d(10), 7, 22)).toEqual({ top: 1200, bottom: 1320, fromPrev: false, toNext: true });
    expect(daySegment(e, d(11), 7, 22)).toEqual({ top: 420, bottom: 540, fromPrev: true, toNext: false });
    expect(daySegment(e, d(12), 7, 22)).toBeNull();
  });

  it("an event ending at midnight ends at the bottom of its day only", () => {
    const e = { start: d(10, 18), end: d(11) };
    expect(daySegment(e, d(10), 7, 22)).toMatchObject({ bottom: 1320, toNext: false });
    expect(daySegment(e, d(11), 7, 22)).toBeNull();
  });
});
