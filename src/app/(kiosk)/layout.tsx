import { StoreProvider } from "@/lib/state/store";
import { PinDialog } from "@/components/layout/PinDialog";
import { WallFullscreen } from "@/components/layout/WallFullscreen";
import { ErrorToast } from "@/components/ui/ErrorText";
import { DoorbellWatcher } from "@/components/cameras/Cameras";
import { guardedSnapshot } from "@/server/guard";

export const dynamic = "force-dynamic";

/** Kiosk surfaces: no admin chrome, and fullscreen on touch screens (D56). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const snapshot = await guardedSnapshot();
  return (
    <StoreProvider initial={snapshot}>
      <div className="min-h-dvh select-none">{children}</div>
      <WallFullscreen />
      <DoorbellWatcher />
      <PinDialog />
      <ErrorToast />
    </StoreProvider>
  );
}
