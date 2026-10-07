import type { Chore, HouseholdData, Member, Period, Routine } from "../types";
import { occursOn } from "../recurrence";

/**
 * Household selectors (§4, §6): pure functions over the snapshot. The store
 * binds them to the current data, so components call `getMember(id)` without
 * knowing where members come from.
 */
export function householdSelectors(d: HouseholdData) {
  const getMembers = () => d.members;
  const getMember = (id: string | null | undefined): Member | undefined => (id ? d.members.find((m) => m.id === id) : undefined);
  const children = () => d.members.filter((m) => m.role === "child");

  const routinesFor = (memberId: string, day: Date): Routine[] =>
    d.routines.filter((r) => r.memberId === memberId && occursOn(r.recurrence, day));
  const routineFor = (memberId: string, period: Period, day: Date): Routine | undefined =>
    routinesFor(memberId, day).find((r) => r.period === period);
  const choresOn = (day: Date): Chore[] => d.chores.filter((c) => occursOn(c.recurrence, day));

  return {
    getMembers, getMember, children, routinesFor, routineFor, choresOn,
    allRoutines: () => d.routines,
    allChores: () => d.chores,
  };
}

/** Which routine the wall shows "now". */
export function currentPeriod(now = new Date()): Period {
  const h = now.getHours();
  return h < 11 ? "morning" : h < 17 ? "afternoon" : "evening";
}
