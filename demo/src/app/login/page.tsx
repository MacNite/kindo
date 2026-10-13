"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The static demo is always signed in as Anna (§20 D74): signing out just comes back. */
export default function Page() {
  const router = useRouter();
  useEffect(() => router.replace("/"), [router]);
  return null;
}
