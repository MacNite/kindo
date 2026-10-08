"use client";
import { useEffect, useRef } from "react";
import { useI18n, type MessageKey } from "@/i18n";
import { useStore } from "@/lib/state/store";

/** A translated error from a Server Action's error code, with the service's own words for admins (`detail`). */
export function ErrorText({ code, detail, className }: { code: string | null | undefined; detail?: string; className?: string }) {
  const { t } = useI18n();
  if (!code) return null;
  return (
    <span role="alert" className={`text-sm font-bold text-[#B4443C] dark:text-[#E98A80] ${className ?? ""}`}>
      {t(`errors.${code}` as MessageKey)}
      {detail && <span className="block break-words font-normal">{detail}</span>}
    </span>
  );
}

/** Shows a background save that failed, then gets out of the way. */
export function ErrorToast() {
  const { error, clearError } = useStore();
  // clearError is a new function on every store render: keep the latest without restarting the timer.
  const clear = useRef(clearError);
  clear.current = clearError;
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => clear.current(), 5000);
    return () => clearTimeout(id);
  }, [error]);
  if (!error) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-[120] -translate-x-1/2 animate-rise rounded-full bg-ink px-5 py-3 text-surface md:bottom-8">
      <ErrorText code={error} className="!text-surface" />
    </div>
  );
}
