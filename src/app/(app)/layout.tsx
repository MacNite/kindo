import { AppShell } from "@/components/layout/AppShell";
import { StoreProvider } from "@/lib/state/store";
import { guardedSnapshot } from "@/server/guard";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const snapshot = await guardedSnapshot();
  return <StoreProvider initial={snapshot}><AppShell>{children}</AppShell></StoreProvider>;
}
