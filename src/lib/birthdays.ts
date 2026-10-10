import type { ContactBirthday, ImportantDate, Member, Text } from "./types";
import { startOfDay } from "./dates";

/**
 * The birthday wheel (§12, D46): family members, birthdays entered in Kindo
 * and the contacts the household picked, one list for the year.
 */
export interface Birthday {
  id: string;
  origin: "member" | "date" | "contact";
  /** As shown in Kindo: a contact's alias wins over its address-book name. */
  name: string;
  /** YYYY-MM-DD, or --MM-DD when the year is unknown. */
  date: string;
  /** Who it belongs to: the person themself, or the person a date or contact belongs to. */
  memberId?: string;
  /** A contact's own colour; a contact without one is muted, never in the colour of whom it belongs to (D61). */
  color?: string;
  /** A contact's picture. */
  photo?: string;
}

export interface UpcomingBirthday extends Birthday {
  next: Date;
  /** Whole days from today; 0 on the day. */
  days: number;
  /** The age on `next`, when the year is known. */
  turns?: number;
  /** "In 5 months and 6 days": calendar months, then the days left over. */
  months: number;
  restDays: number;
  /** Where on the year the birthday sits, 0 (1 January) to 1. */
  yearFraction: number;
}

const DAY = 86_400_000;
const MD = /^(?:(\d{4})|--)-?(\d{2})-?(\d{2})$/;

/** Year (or null), month (0–11) and day of a YYYY-MM-DD or --MM-DD date. */
export function parseBirthday(s: string): { year: number | null; month: number; day: number } | null {
  const m = MD.exec(s.trim());
  if (!m) return null;
  const month = Number(m[2]) - 1, day = Number(m[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year: m[1] ? Number(m[1]) : null, month, day };
}

/** 29 February falls on 28 February in other years. */
const onYear = (year: number, month: number, day: number) => new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);

/** Calendar months from `from` to `to`, and the days left after them. */
export function monthsAndDays(from: Date, to: Date): { months: number; days: number } {
  const a = startOfDay(from);
  // Same day of the month, n months on (the 31st becomes the month's last day).
  const after = (n: number) => {
    const first = new Date(a.getFullYear(), a.getMonth() + n, 1);
    return onYear(first.getFullYear(), first.getMonth(), a.getDate());
  };
  let months = Math.max(0, (to.getFullYear() - a.getFullYear()) * 12 + to.getMonth() - a.getMonth());
  if (months > 0 && after(months) > startOfDay(to)) months--;
  return { months, days: daysBetween(after(months), to) };
}

export function upcomingBirthday(b: Birthday, today: Date): UpcomingBirthday | null {
  const p = parseBirthday(b.date);
  if (!p) return null;
  const t = startOfDay(today);
  let next = onYear(t.getFullYear(), p.month, p.day);
  if (next < t) next = onYear(t.getFullYear() + 1, p.month, p.day);
  const turns = p.year !== null && next.getFullYear() > p.year ? next.getFullYear() - p.year : undefined;
  const { months, days: restDays } = monthsAndDays(t, next);
  const start = new Date(next.getFullYear(), 0, 1);
  const length = daysBetween(start, new Date(next.getFullYear() + 1, 0, 1));
  return { ...b, next, days: daysBetween(t, next), turns, months, restDays, yearFraction: (daysBetween(start, next) + 0.5) / length };
}

export function upcomingBirthdays(list: Birthday[], today: Date): UpcomingBirthday[] {
  return list
    .map((b) => upcomingBirthday(b, today))
    .filter((b): b is UpcomingBirthday => b !== null)
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

const monthDay = (s: string) => {
  const p = parseBirthday(s);
  return p ? `${p.month}-${p.day}` : "";
};
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/**
 * Everyone on the wheel, each once: members with a birthday, yearly
 * birthdays entered in Kindo, and the contacts shown. A Kindo birthday for a
 * member who has one already, or a contact with the same name and day as a
 * Kindo birthday, is left out.
 */
export function collectBirthdays(members: Member[], dates: ImportantDate[], contacts: ContactBirthday[], tx: (t: Text) => string): Birthday[] {
  const out: Birthday[] = members.filter((m) => m.birthday).map((m) => ({ id: `member:${m.id}`, origin: "member", name: m.name, date: m.birthday!, memberId: m.id }));
  const memberDay = new Map(members.filter((m) => m.birthday).map((m) => [m.id, monthDay(m.birthday!)]));
  for (const d of dates) {
    if (d.kind !== "birthday" || !d.yearly) continue;
    if (d.memberId && memberDay.get(d.memberId) === monthDay(d.date)) continue;
    out.push({ id: `date:${d.id}`, origin: "date", name: tx(d.title), date: d.date, memberId: d.memberId });
  }
  const own = out.filter((b) => b.origin === "date");
  for (const c of contacts) {
    if (!c.show) continue;
    const name = c.alias?.trim() || c.name;
    if (own.some((b) => sameName(b.name, name) && monthDay(b.date) === monthDay(c.date))) continue;
    out.push({ id: `contact:${c.id}`, origin: "contact", name, date: c.date, memberId: c.memberId, color: c.color, photo: c.photo });
  }
  return out;
}

/**
 * Rings for the dots on the wheel: a dot that would touch an earlier one on
 * its ring moves one ring inwards. `gap` is the smallest distance between two
 * dots as a share of the circle.
 */
export function wheelRings(items: { id: string; yearFraction: number }[], gap: number): Map<string, number> {
  const placed: { f: number; ring: number }[] = [];
  const rings = new Map<string, number>();
  for (const it of [...items].sort((a, b) => a.yearFraction - b.yearFraction)) {
    const near = (q: { f: number }) => {
      const d = Math.abs(q.f - it.yearFraction);
      return Math.min(d, 1 - d) < gap;
    };
    let ring = 0;
    while (placed.some((q) => q.ring === ring && near(q))) ring++;
    placed.push({ f: it.yearFraction, ring });
    rings.set(it.id, ring);
  }
  return rings;
}

/** Initials for a dot: "Oma Biggy" → "OB". */
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]).join("").toLocaleUpperCase();
