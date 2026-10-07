import { redirect } from "next/navigation";
import { StoreProvider } from "@/lib/state/store";
import { prisma } from "@/server/db";
import { loadSnapshot } from "@/server/snapshot";

export const dynamic = "force-dynamic";

/** Kiosk surfaces: no admin chrome. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const snapshot = await loadSnapshot(prisma);
  if (!snapshot) redirect("/setup");
  return <StoreProvider initial={snapshot}><div className="min-h-dvh select-none">{children}</div></StoreProvider>;
}
