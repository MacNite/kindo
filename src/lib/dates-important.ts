import type { ImportantDate, UpcomingDate } from "./types";
import { startOfDay } from "./dates";

const parseDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/**
 * When an important date comes round next (§12). Yearly dates repeat on
 * their month and day (29 February falls on 28 February in other years) and
 * count how old someone turns. One-off dates are shown until they have passed.
 */
export function nextOccurrence(d: ImportantDate, today: Date): UpcomingDate | null {
  const base = parseDay(d.date);
  const t = startOfDay(today);
  if (!d.yearly) return base >= t ? { ...d, next: base } : null;
  const on = (year: number) => {
    const last = new Date(year, base.getMonth() + 1, 0).getDate();
    return new Date(year, base.getMonth(), Math.min(base.getDate(), last));
  };
  let next = on(t.getFullYear());
  if (next < t) next = on(t.getFullYear() + 1);
  const turns = next.getFullYear() - base.getFullYear();
  return { ...d, next, turns: (d.kind === "birthday" || d.kind === "anniversary") && turns > 0 ? turns : undefined };
}

export function upcomingDates(dates: ImportantDate[], today: Date): UpcomingDate[] {
  return dates.map((d) => nextOccurrence(d, today)).filter((d): d is UpcomingDate => d !== null).sort((a, b) => a.next.getTime() - b.next.getTime());
}
