"use client";
import { useRouter } from "next/navigation";
import { Screensaver } from "@/components/photos/Screensaver";

export default function Page() {
  const router = useRouter();
  return <Screensaver onWake={() => (history.length > 1 ? router.back() : router.push("/wall"))} />;
}
