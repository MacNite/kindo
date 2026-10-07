import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { StoreProvider } from "@/lib/state/store";
import { prisma } from "@/server/db";
import { loadSnapshot } from "@/server/snapshot";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const snapshot = await loadSnapshot(prisma);
  if (!snapshot) redirect("/setup");
  return <StoreProvider initial={snapshot}><AppShell>{children}</AppShell></StoreProvider>;
}
