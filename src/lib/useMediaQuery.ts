"use client";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, following changes (rotation, resizing).
 * Lets a screen render only the layout it shows, so a hidden one doesn't
 * mount, fetch or poll. `fallback` is the answer where there is no window.
 */
export function useMediaQuery(query: string, fallback = false) {
  const subscribe = useCallback((onChange: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => fallback);
}
