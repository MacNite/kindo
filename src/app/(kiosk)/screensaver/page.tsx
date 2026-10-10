"use client";
import { useRouter } from "next/navigation";
import { Screensaver } from "@/components/photos/Screensaver";
import { useWakeLock } from "@/lib/useWakeLock";
import { useNight } from "@/lib/state/useNight";

export default function Page() {
  const router = useRouter();
  // A photo frame that goes dark is no photo frame (§13, D36), except in the night rest (D59).
  useWakeLock(!useNight());
  return <Screensaver onWake={() => (history.length > 1 ? router.back() : router.push("/wall"))} />;
}
