"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "./store";
import { useNight } from "./useNight";

/**
 * The photo frame as a kiosk surface's screensaver (§13): shown after the
 * household's idle minutes without a touch or key, and when Home Assistant
 * says nobody is there; presence wakes it again, except in the night rest (D59).
 */
export function useIdleSaver() {
  const { idleMinutes, presence } = useStore();
  const night = useNight();
  const [saver, setSaver] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const poke = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaver(true), idleMinutes * 60_000);
  }, [idleMinutes]);

  useEffect(() => {
    poke();
    const evs = ["pointerdown", "keydown"] as const;
    evs.forEach((e) => window.addEventListener(e, poke));
    return () => { clearTimeout(timer.current); evs.forEach((e) => window.removeEventListener(e, poke)); };
  }, [poke]);

  // Someone there wakes the screen, nobody there brings the photos back. At night only a touch wakes it.
  useEffect(() => {
    if (!presence) return;
    if (presence.present) {
      if (night) return;
      setSaver(false);
      poke();
    } else setSaver(true);
  }, [presence, poke, night]);

  const show = useCallback(() => setSaver(true), []);
  const wake = useCallback(() => { setSaver(false); poke(); }, [poke]);
  return { saver, show, wake };
}
