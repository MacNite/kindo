import { describe, expect, it } from "vitest";
import { collectBirthdays, initials, monthsAndDays, parseBirthday, upcomingBirthday, upcomingBirthdays, wheelRings, type Birthday } from "./birthdays";
import type { ContactBirthday, ImportantDate, Member } from "./types";

const today = new Date(2026, 9, 8);
const b = (date: string, extra: Partial<Birthday> = {}): Birthday => ({ id: date, origin: "contact", name: "x", date, ...extra });
const member = (id: string, birthday?: string): Member => ({ id, name: id, role: "child", color: "#3B78C2", avatar: { kind: "initial" }, birthday });
const tx = (t: string | { de: string; en: string }) => (typeof t === "string" ? t : t.en);

describe("parseBirthday", () => {
  it("reads full dates and dates without a year", () => {
    expect(parseBirthday("1951-10-13")).toEqual({ year: 1951, month: 9, day: 13 });
    expect(parseBirthday("--07-04")).toEqual({ year: null, month: 6, day: 4 });
    expect(parseBirthday("--0704")).toEqual({ year: null, month: 6, day: 4 });
    expect(parseBirthday("not a date")).toBeNull();
    expect(parseBirthday("2020-13-01")).toBeNull();
  });
});

describe("upcomingBirthday", () => {
  it("counts days, age and months to go", () => {
    expect(upcomingBirthday(b("1951-10-13"), today)).toMatchObject({ next: new Date(2026, 9, 13), days: 5, turns: 75, months: 0, restDays: 5 });
    expect(upcomingBirthday(b("1988-03-14"), today)).toMatchObject({ next: new Date(2027, 2, 14), days: 157, turns: 39, months: 5, restDays: 6 });
  });

  it("is today on the day itself, and has no age without a year", () => {
    expect(upcomingBirthday(b("--10-08"), today)).toMatchObject({ days: 0, turns: undefined, months: 0, restDays: 0 });
  });

  it("puts 29 February on 28 February in other years", () => {
    expect(upcomingBirthday(b("2016-02-29"), today)?.next).toEqual(new Date(2027, 1, 28));
  });

  it("places the day on the year, January at 0", () => {
    expect(upcomingBirthday(b("--01-01"), today)!.yearFraction).toBeCloseTo(0.5 / 365);
    expect(upcomingBirthday(b("--07-02"), today)!.yearFraction).toBeCloseTo(182.5 / 365);
  });

  it("sorts the soonest first and skips dates it can't read", () => {
    expect(upcomingBirthdays([b("1988-03-14"), b("bad"), b("2018-10-20")], today).map((x) => x.id)).toEqual(["2018-10-20", "1988-03-14"]);
  });
});

describe("monthsAndDays", () => {
  it("counts calendar months, then days", () => {
    expect(monthsAndDays(new Date(2026, 0, 31), new Date(2026, 2, 1))).toEqual({ months: 1, days: 1 });
    expect(monthsAndDays(new Date(2026, 9, 8), new Date(2026, 9, 8))).toEqual({ months: 0, days: 0 });
    expect(monthsAndDays(new Date(2026, 9, 8), new Date(2027, 9, 7))).toEqual({ months: 11, days: 29 });
  });
});

describe("collectBirthdays", () => {
  const contact = (id: string, extra: Partial<ContactBirthday> = {}): ContactBirthday => ({ id, name: "Mama Nitschke", date: "1951-10-13", show: true, ...extra });
  const date = (id: string, extra: Partial<ImportantDate> = {}): ImportantDate => ({ id, kind: "birthday", title: "Uroma Hilde", date: "1938-11-25", yearly: true, ...extra });

  it("takes members, Kindo birthdays and shown contacts, with the alias as name", () => {
    const list = collectBirthdays([member("lena", "2018-10-20"), member("max")], [date("d1"), date("d2", { kind: "anniversary" })],
      [contact("c1", { alias: "Oma Biggy", memberId: "max" }), contact("c2", { show: false })], tx);
    expect(list).toEqual([
      { id: "member:lena", origin: "member", name: "lena", date: "2018-10-20", memberId: "lena" },
      { id: "date:d1", origin: "date", name: "Uroma Hilde", date: "1938-11-25", memberId: undefined },
      { id: "contact:c1", origin: "contact", name: "Oma Biggy", date: "1951-10-13", memberId: "max" },
    ]);
  });

  it("gives a contact its own colour and photo, never the colour of whom it belongs to (D61)", () => {
    const [plain, own] = collectBirthdays([], [], [contact("c1", { memberId: "max" }), contact("c2", { name: "Opa", color: "#2E8B6E", photo: "/api/contacts/c2/photo?v=1" })], tx);
    expect(plain).toMatchObject({ memberId: "max" });
    expect(plain.color).toBeUndefined();
    expect(own).toMatchObject({ color: "#2E8B6E", photo: "/api/contacts/c2/photo?v=1" });
  });

  it("shows each person once", () => {
    const list = collectBirthdays([member("lena", "2018-10-20")], [date("d1", { memberId: "lena", title: "Lena", date: "2018-10-20" }), date("d2")],
      [contact("c1", { name: "uroma hilde", date: "--11-25" })], tx);
    expect(list.map((x) => x.id)).toEqual(["member:lena", "date:d2"]);
  });
});

describe("wheelRings", () => {
  it("moves a dot that would touch another one ring inwards, across New Year too", () => {
    const rings = wheelRings([{ id: "a", yearFraction: 0.5 }, { id: "b", yearFraction: 0.51 }, { id: "c", yearFraction: 0.7 }, { id: "d", yearFraction: 0.995 }, { id: "e", yearFraction: 0.002 }], 0.03);
    expect(Object.fromEntries(rings)).toEqual({ a: 0, b: 1, c: 0, d: 1, e: 0 });
  });
});

it("initials", () => {
  expect(initials("Oma Biggy")).toBe("OB");
  expect(initials("  ingrid ")).toBe("I");
});
