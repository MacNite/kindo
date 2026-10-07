import type { Member, Period, Routine } from "../types";
import { MEMBERS } from "../data/members";
import { ROUTINES, CHORES } from "../data/routines";
import { occursOn } from "../recurrence";

export const getMembers = () => MEMBERS;
export const getMember = (id: string | null | undefined): Member | undefined => MEMBERS.find((m) => m.id === id);
export const children = () => MEMBERS.filter((m) => m.role === "child");

/** Which routine the wall shows "now". Times will come from settings. */
export function currentPeriod(now = new Date()): Period {
  const h = now.getHours();
  return h < 11 ? "morning" : h < 17 ? "afternoon" : "evening";
}

export const routinesFor = (memberId: string, day: Date) =>
  ROUTINES.filter((r) => r.memberId === memberId && occursOn(r.recurrence, day));

export function routineFor(memberId: string, period: Period, day: Date): Routine | undefined {
  return routinesFor(memberId, day).find((r) => r.period === period);
}

export const allRoutines = () => ROUTINES;
export const choresOn = (day: Date) => CHORES.filter((c) => occursOn(c.recurrence, day));
export const allChores = () => CHORES;
