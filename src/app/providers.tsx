"use client";
import { useEffect, useState, type ReactNode } from "react";
import { PrefsProvider } from "@/lib/state/prefs";
import { I18nProvider } from "@/i18n";
import { StoreProvider } from "@/lib/state/store";

/**
 * The prototype renders client-side only: theme, language and "now" all come
 * from the device, so skipping SSR avoids hydration mismatches. A real build
 * can move language to the URL/cookie and re-enable SSR.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="min-h-dvh bg-bg" />;
  return (
    <PrefsProvider>
      <I18nProvider>
        <StoreProvider>{children}</StoreProvider>
      </I18nProvider>
    </PrefsProvider>
  );
}
