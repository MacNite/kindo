"use client";
import { isNightAt } from "../night";
import { useNow } from "../useNow";
import { useStore } from "./store";

/**
 * Whether the wall is in its night rest now (§13, D59). Checked every 20 s,
 * so the screen lets go within a minute of the set time.
 */
export function useNight(): boolean {
  const { night, data } = useStore();
  const now = useNow(20_000);
  return isNightAt(now, night, data.household.timezone);
}
