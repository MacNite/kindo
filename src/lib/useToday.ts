"use client";
import { useCallback, useSyncExternalStore } from "react";
import { householdDay } from "./recurrence";

/**
 * The current day (local midnight), rolling over at `rollover` (HH:MM).
 * Calendars use the default, midnight; routines use the household's reset
 * time (§19.3), so the evening routine stays on screen until it has passed.
 * One shared timer; a Date instance only changes when its day does, so it is
 * safe as a hook dependency.
 */
const days = new Map<string, Date>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

const current = (rollover: string) => {
  let d = days.get(rollover);
  if (!d) days.set(rollover, (d = householdDay(new Date(), rollover)));
  return d;
};

function check() {
  const now = new Date();
  let changed = false;
  for (const [rollover, d] of days) {
    const next = householdDay(now, rollover);
    if (next.getTime() !== d.getTime()) {
      days.set(rollover, next);
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

export function useToday(rollover = "00:00") {
  const snapshot = useCallback(() => current(rollover), [rollover]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
