"use client";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StoreProvider } from "@/lib/state/store";
import { DemoBanner } from "../../components/demo/DemoBanner";
import { snapshot } from "../../server/demo/browser";

/** The static demo's household pages (§20 D74): the snapshot comes from this browser, not a server. */
export default function Layout({ children }: { children: React.ReactNode }) {
  const [initial] = useState(() => snapshot());
  return <StoreProvider initial={initial}><DemoBanner /><AppShell>{children}</AppShell></StoreProvider>;
}
