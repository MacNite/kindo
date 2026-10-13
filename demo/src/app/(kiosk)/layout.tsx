"use client";
import { useState } from "react";
import { StoreProvider } from "@/lib/state/store";
import { PinDialog } from "@/components/layout/PinDialog";
import { WallFullscreen } from "@/components/layout/WallFullscreen";
import { ErrorToast } from "@/components/ui/ErrorText";
import { DoorbellWatcher } from "@/components/cameras/Cameras";
import { MiniPlayer } from "@/components/media/Media";
import { snapshot } from "../../server/demo/browser";

/** The static demo's kiosk surfaces (§20 D74): as in the app, with the snapshot from this browser. */
export default function Layout({ children }: { children: React.ReactNode }) {
  const [initial] = useState(() => snapshot());
  return (
    <StoreProvider initial={initial}>
      <div className="min-h-dvh select-none">{children}</div>
      <WallFullscreen />
      <MiniPlayer kiosk />
      <DoorbellWatcher />
      <PinDialog />
      <ErrorToast />
    </StoreProvider>
  );
}
