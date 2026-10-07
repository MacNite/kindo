"use client";
import { useEffect, useState, type ReactNode } from "react";
import { PrefsProvider } from "@/lib/state/prefs";
import { I18nProvider } from "@/i18n";

/**
 * Screens render on the device (§20 D7): theme, language and "now" all come
 * from it, so skipping SSR avoids hydration mismatches. Household data is
 * loaded on the server by the route-group layouts and handed to the store.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="min-h-dvh bg-bg" />;
  return (
    <PrefsProvider>
      <I18nProvider>{children}</I18nProvider>
    </PrefsProvider>
  );
}
