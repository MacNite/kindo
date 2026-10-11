import { describe, expect, it } from "vitest";
import { nextUp, shortNames } from "./nextUp";
import { addDays, at, startOfDay } from "./dates";
import type { CalendarEvent, Member } from "./types";

const today = startOfDay(new Date(2026, 9, 7));
const member = (id: string, name = id): Member =>
  ({ id, name, color: "#000", role: "adult", avatar: { kind: "initial" } }) as unknown as Member;
const members = ["anna", "ben", "lena", "paul"].map((n) => member(n, n[0].toUpperCase() + n.slice(1)));
const ev = (id: string, start: Date, hours = 1, extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, title: id, start, end: new Date(start.getTime() + hours * 3_600_000), memberIds: ["anna"], sourceId: "s", ...extra });
const ids = (n: ReturnType<typeof nextUp>) => n?.items.map((i) => i.event.id);

describe("nextUp (D69)", () => {
  it("picks the earliest commitment still ahead, across everyone", () => {
    const n = nextUp([ev("late", at(today, 17), 1, { memberIds: ["ben"] }), ev("soon", at(today, 15), 1, { memberIds: ["lena"] }), ev("done", at(today, 9))], members, at(today, 12));
    expect(ids(n)).toEqual(["soon"]);
    expect(n).toMatchObject({ now: false, tomorrow: false });
    expect(n!.items[0].owners.map((m) => m.id)).toEqual(["lena"]);
  });

  it("never lets background attendance or all-day events take the slot", () => {
    const n = nextUp([
      ev("school", at(today, 13), 3, { background: true }),
      ev("trip", today, 24, { allDay: true }),
      ev("swim", at(today, 16)),
    ], members, at(today, 12));
    expect(ids(n)).toEqual(["swim"]);
    expect(nextUp([ev("school", at(today, 13), 3, { background: true }), ev("trip", addDays(today, 1), 24, { allDay: true })], members, at(today, 12))).toBeNull();
  });

  it("keeps an event that just began as 'now' for ten minutes, then moves on", () => {
    const events = [ev("dentist", at(today, 15), 1), ev("swim", at(today, 17))];
    expect(nextUp(events, members, at(today, 15, 9))).toMatchObject({ now: true, items: [{ event: { id: "dentist" } }] });
    expect(ids(nextUp(events, members, at(today, 15, 11)))).toEqual(["swim"]);
    // A long event already under way (a shift, a timed trip) does not hold the slot.
    expect(ids(nextUp([ev("shift", at(today, 8), 9), ev("swim", at(today, 17))], members, at(today, 12)))).toEqual(["swim"]);
  });

  it("looks as far as the end of tomorrow, and says when it's tomorrow", () => {
    const events = [ev("early", at(addDays(today, 1), 7, 30)), ev("later", at(addDays(today, 2), 9))];
    expect(nextUp(events, members, at(today, 20))).toMatchObject({ tomorrow: true, items: [{ event: { id: "early" } }] });
    expect(nextUp([events[1]], members, at(today, 20))).toBeNull();
  });

  it("shows events in the same minute together, the whole family's first, then by the lanes' order", () => {
    const n = nextUp([
      ev("paul", at(today, 15), 1, { memberIds: ["paul"] }),
      ev("anna", at(today, 15, 0), 2, { memberIds: ["anna"] }),
      ev("fam", at(today, 15), 1, { memberIds: [] }),
      ev("later", at(today, 15, 1)),
    ], members, at(today, 12));
    expect(ids(n)).toEqual(["fam", "anna", "paul"]);
    expect(n!.items[0]).toMatchObject({ family: true, owners: [] });
  });

  it("counts an event naming everyone as the whole family's, and ignores people who left", () => {
    const all = ev("all", at(today, 15), 1, { memberIds: ["paul", "anna", "ben", "lena"] });
    expect(nextUp([all], members, at(today, 12))!.items[0]).toMatchObject({ family: true, owners: [] });
    const two = nextUp([ev("two", at(today, 15), 1, { memberIds: ["paul", "gone", "anna"] })], members, at(today, 12))!.items[0];
    expect(two.family).toBe(false);
    expect(two.owners.map((m) => m.id)).toEqual(["anna", "paul"]);
  });

  it("is empty when nothing is left", () => {
    expect(nextUp([], members, at(today, 12))).toBeNull();
    expect(nextUp([ev("done", at(today, 9))], members, at(today, 12))).toBeNull();
  });
});

describe("shortNames", () => {
  it("uses initials, and more letters only where two would read the same", () => {
    const s = shortNames([member("a", "Anna-Lena"), member("b", "Max"), member("c", "Mia"), member("d", "Ben Müller"), member("e", "Marlene"), member("f", "Paul")]);
    expect(Object.fromEntries(s)).toEqual({ a: "AL", b: "Max", c: "Mi", d: "BM", e: "Mar", f: "P" });
  });
});
