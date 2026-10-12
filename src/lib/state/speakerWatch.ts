"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { SpeakerState } from "../media";
import { readSpeakers } from "../services/media";

/** How often the speakers are read while one plays or pauses the shelf, and otherwise. */
const BUSY_MS = 5_000;
const QUIET_MS = 10_000;

/**
 * What the household's speakers play, for the mini player on every page
 * (§23, D73): one reading for the whole tab, however many views watch it,
 * and only while the page is visible.
 */
let speakers: SpeakerState[] = [];
const listeners = new Set<() => void>();
let watchers = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let reading = false;

/** A speaker that plays or pauses something from the kids' shelf. */
export const onShelf = (s: SpeakerState) => Boolean(s.itemId) && (s.state === "playing" || s.state === "paused");

function publish(next: SpeakerState[]) {
  speakers = next;
  listeners.forEach((l) => l());
}

async function read() {
  if (reading) return;
  reading = true;
  const r = await readSpeakers({}).catch(() => null);
  reading = false;
  if (r?.ok) publish(r.data);
  schedule();
}

function schedule() {
  clearTimeout(timer);
  if (!watchers) return;
  timer = setTimeout(() => (document.visibilityState === "visible" ? void read() : schedule()), speakers.some(onShelf) ? BUSY_MS : QUIET_MS);
}

function onVisible() {
  if (document.visibilityState === "visible" && watchers) void read();
}

export const speakerWatch = {
  /** Reads again shortly, after a command changed a speaker. */
  refresh() {
    if (watchers) setTimeout(() => void read(), 800);
  },
  /** Shows a command's outcome at once, before the next reading confirms it. */
  patch(entityId: string, patch: Partial<SpeakerState>) {
    publish(speakers.map((s) => (s.entityId === entityId ? { ...s, ...patch } : s)));
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: SpeakerState[] = [];

/** The speakers playing or pausing the kids' shelf; `on` when the household has speakers. */
export function useShelfSpeakers(on: boolean): SpeakerState[] {
  useEffect(() => {
    if (!on) return;
    if (watchers++ === 0) {
      document.addEventListener("visibilitychange", onVisible);
      void read();
    }
    return () => {
      if (--watchers > 0) return;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [on]);
  const all = useSyncExternalStore(subscribe, () => speakers, () => EMPTY);
  return on ? all.filter(onShelf) : EMPTY;
}
