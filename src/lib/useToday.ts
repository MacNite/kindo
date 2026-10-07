"use client";
import { useSyncExternalStore } from "react";
import { sameDay, startOfDay } from "./dates";

/**
 * The current calendar day (midnight, local time). Rolls over at midnight so
 * an always-on wall display moves on to the new day. One shared timer; the
 * Date instance only changes when the day does, so it is safe as a hook dep.
 */
let today = startOfDay(new Date());
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function check() {
  const now = new Date();
  if (sameDay(now, today)) return;
  today = startOfDay(now);
  listeners.forEach((l) => l());
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

const snapshot = () => today;

export function useToday() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
