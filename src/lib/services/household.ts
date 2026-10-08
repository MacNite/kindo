import type { Chore, HouseholdData, Member, Period, Routine } from "../types";

type Holiday = HouseholdData["holidays"][number];
import { occursOn, schoolDaysFrom } from "../recurrence";
import { dateKey } from "../dates";

/**
 * Household selectors (§4, §6): pure functions over the snapshot. The store
 * binds them to the current data, so components call `getMember(id)` without
 * knowing where members come from.
 */
export function householdSelectors(d: HouseholdData) {
  const isSchoolDay = schoolDaysFrom(d.holidays);
  const getMembers = () => d.members;
  const getMember = (id: string | null | undefined): Member | undefined => (id ? d.members.find((m) => m.id === id) : undefined);
  const children = () => d.members.filter((m) => m.role === "child");

  const routinesFor = (memberId: string, day: Date): Routine[] =>
    d.routines.filter((r) => r.memberId === memberId && occursOn(r.recurrence, day, isSchoolDay));
  const routineFor = (memberId: string, period: Period, day: Date): Routine | undefined =>
    routinesFor(memberId, day).find((r) => r.period === period);
  const choresOn = (day: Date): Chore[] => d.chores.filter((c) => occursOn(c.recurrence, day, isSchoolDay));
  /** Holiday ranges covering a day, one per name (two feeds often list the same holiday). */
  const holidaysOn = (day: Date): Holiday[] => {
    const k = dateKey(day);
    const seen = new Set<string>();
    return d.holidays.filter((h) => h.start <= k && k <= h.end && !seen.has(h.summary) && !!seen.add(h.summary));
  };

  return {
    getMembers, getMember, children, routinesFor, routineFor, choresOn, isSchoolDay, holidaysOn,
    allRoutines: () => d.routines,
    allChores: () => d.chores,
  };
}

export interface DayProgress {
  day: Date;
  /** Per period: steps due and steps done. Missing when no routine was due. */
  periods: Partial<Record<Period, { due: number; done: number }>>;
  choresDue: number;
  choresDone: number;
}

/**
 * What a member had to do on a day and how much of it got done (§19.3).
 * Uses today's routines: history shows how the current plan went, and steps
 * that were deleted since then simply don't count.
 */
export function dayProgress(d: HouseholdData, memberId: string, day: Date): DayProgress {
  const { routinesFor, choresOn } = householdSelectors(d);
  const key = dateKey(day);
  const done = new Set(d.completions.filter((c) => c.day === key && c.status === "done").map((c) => c.itemId));
  const periods: DayProgress["periods"] = {};
  for (const r of routinesFor(memberId, day)) {
    const p = periods[r.period] ?? { due: 0, done: 0 };
    p.due += r.items.length;
    p.done += r.items.filter((i) => done.has(i.id)).length;
    periods[r.period] = p;
  }
  const chores = choresOn(day).filter((c) => c.memberId === memberId && c.item.value.kind === "expected");
  return { day, periods, choresDue: chores.length, choresDone: chores.filter((c) => done.has(c.item.id)).length };
}
