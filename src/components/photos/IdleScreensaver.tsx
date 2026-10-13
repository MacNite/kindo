"use client";
import { useIdleSaver } from "@/lib/state/useIdleSaver";
import { Screensaver } from "./Screensaver";

/** The photo frame over a kiosk surface once it is idle (§13), as on the wall. */
export function IdleScreensaver() {
  const { saver, wake } = useIdleSaver();
  return saver ? <Screensaver onWake={wake} /> : null;
}
