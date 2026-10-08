"use client";
import { useCallback, useSyncExternalStore } from "react";
import { householdDayIn } from "./recurrence";

/**
 * The current day (local midnight), rolling over at `rollover` (HH:MM).
 * Calendars use the default, midnight, on the device's clock; routines use
 * the household's reset time in the household's time zone (§19.3, D52), so
 * the evening routine stays on screen until it has passed.
 * One shared timer; a Date instance only changes when its day does, so it is
 * safe as a hook dependency.
 */
const days = new Map<string, Date>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

/** Keyed by rollover and time zone ("" for the device's own). */
const keyOf = (rollover: string, timeZone = "") => `${rollover}|${timeZone}`;
const dayFor = (now: Date, key: string) => {
  const [rollover, timeZone] = key.split("|");
  return householdDayIn(now, timeZone || undefined, rollover);
};

const current = (key: string) => {
  let d = days.get(key);
  if (!d) days.set(key, (d = dayFor(new Date(), key)));
  return d;
};

function check() {
  const now = new Date();
  let changed = false;
  for (const [key, d] of days) {
    const next = dayFor(now, key);
    if (next.getTime() !== d.getTime()) {
      days.set(key, next);
      changed = true;
    }
  }
  if (changed) listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    // Polling (rather than one long timeout) survives sleep/suspend and clock changes.
    timer = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
  }
  check();
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener("visibilitychange", check);
    }
  };
}

export function useToday(rollover = "00:00", timeZone?: string) {
  const key = keyOf(rollover, timeZone);
  const snapshot = useCallback(() => current(key), [key]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
