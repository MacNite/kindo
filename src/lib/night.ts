import { wallClockIn } from "./dates";
import { minutesOf } from "./recurrence";

/** The wall's night rest (§13, D57): from `from` to `until` (HH:MM, household time), across midnight if `until` is earlier. */
export interface NightRest {
  on: boolean;
  from: string;
  until: string;
}

export const DEFAULT_NIGHT: NightRest = { on: false, from: "22:00", until: "06:00" };

/** Whether `now` falls in the night rest, read on the household's clock. */
export function isNightAt(now: Date, night: NightRest, timeZone?: string): boolean {
  if (!night.on) return false;
  const clock = wallClockIn(now, timeZone);
  const t = clock.getHours() * 60 + clock.getMinutes();
  const from = minutesOf(night.from), until = minutesOf(night.until);
  if (from === until) return false;
  return from < until ? t >= from && t < until : t >= from || t < until;
}
