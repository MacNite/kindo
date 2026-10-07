"use client";
import { useEffect } from "react";

/**
 * Keeps the screen on while mounted (§2, §19.7): the wall display must not go
 * dark. Browsers drop the lock when the tab is hidden, so it is asked for
 * again whenever the page becomes visible. Silently does nothing where the
 * Wake Lock API is missing.
 */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const request = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (!live) await lock.release();
      } catch {
        // Not allowed right now (e.g. battery saver); the next visibility change tries again.
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", request);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);
}
