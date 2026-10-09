"use client";

import { useEffect } from "react";

// Older Android browsers only know the prefixed names.
type Doc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type Root = HTMLElement & { webkitRequestFullscreen?: () => void };

const active = (d: Doc) => d.fullscreenElement ?? d.webkitFullscreenElement ?? null;

function ignore(result: unknown) {
  if (result instanceof Promise) result.catch(() => {});
}

/**
 * Wall surfaces fill the whole screen on touch devices, without the system's
 * status and navigation bars (D56). Browsers allow fullscreen only after a
 * tap, so the first touch enters it, and again after the bars were swiped
 * back. Leaving the wall for the app ends it. Mouse users are left alone.
 */
export function WallFullscreen() {
  useEffect(() => {
    const d = document as Doc;
    const enter = () => {
      if (active(d)) return;
      const root = d.documentElement as Root;
      try {
        if (root.requestFullscreen) ignore(root.requestFullscreen({ navigationUI: "hide" }));
        else root.webkitRequestFullscreen?.();
      } catch {}
    };
    window.addEventListener("touchend", enter, { capture: true, passive: true });
    return () => {
      window.removeEventListener("touchend", enter, { capture: true });
      if (!active(d)) return;
      try {
        if (d.exitFullscreen) ignore(d.exitFullscreen());
        else d.webkitExitFullscreen?.();
      } catch {}
    };
  }, []);
  return null;
}
