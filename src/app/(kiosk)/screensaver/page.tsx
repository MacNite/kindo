"use client";
import { useRouter } from "next/navigation";
import { Screensaver } from "@/components/photos/Screensaver";
import { useWakeLock } from "@/lib/useWakeLock";

export default function Page() {
  const router = useRouter();
  // A photo frame that goes dark is no photo frame (§13, D36).
  useWakeLock();
  return <Screensaver onWake={() => (history.length > 1 ? router.back() : router.push("/wall"))} />;
}
