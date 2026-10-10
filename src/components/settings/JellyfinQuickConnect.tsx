"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { checkJellyfinQuickConnect, startJellyfinQuickConnect } from "@/lib/services/integrations";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";

/** How often Kindo asks whether the code was entered. */
const CHECK_MS = 2000;

export type QuickConnectDone = { id: string; name: string; switched: boolean };

/**
 * Jellyfin's Quick Connect (§23, D66): Kindo shows a code, someone signed in
 * to Jellyfin as the children's user enters it there, and Kindo signs in as
 * that user. For users who sign in with single sign-on and have no password
 * Jellyfin takes. With `connId` it signs an existing connection in again.
 */
export function JellyfinQuickConnect({ url, connId, onDone }: { url: string; connId?: string; onDone: (r: QuickConnectDone) => void }) {
  const { t } = useI18n();
  const { run } = useStore();
  const [pending, setPending] = useState<{ code: string; attempt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; detail?: string } | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  const start = async () => {
    setBusy(true);
    setError(null);
    setPending(null);
    const r = await run(() => startJellyfinQuickConnect({ url }));
    setBusy(false);
    if (r.ok) setPending(r.data);
    else setError({ code: r.error, detail: r.detail });
  };

  // Asks until the code was entered, it ran out, or the dialog closes.
  useEffect(() => {
    if (!pending) return;
    let live = true;
    let checking = false;
    const timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      const r = await checkJellyfinQuickConnect({ attempt: pending.attempt, ...(connId ? { id: connId } : {}) }).catch(() => ({ ok: false as const, error: "network" }));
      checking = false;
      if (!live) return;
      if (!r.ok) {
        // A moment without a connection isn't the end of the attempt.
        if (r.error === "network") return;
        setPending(null);
        setError({ code: r.error, detail: "detail" in r ? r.detail : undefined });
      } else if (r.data.done) {
        setPending(null);
        done.current(r.data);
      }
    }, CHECK_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [pending, connId]);

  return (
    <div className="flex flex-col gap-3">
      {pending ? (
        <div role="status" className="flex flex-col items-center gap-2 rounded-card bg-sunken p-4 text-center">
          <span className="text-sm text-soft">{t("integrations.qcEnter")}</span>
          <span aria-label={t("integrations.qcCode")} data-testid="quick-connect-code" className="font-mono text-4xl font-bold tracking-[0.3em]">{pending.code}</span>
          <span className="text-sm text-soft">{t("integrations.qcWaiting")}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant={pending ? "ghost" : "primary"} disabled={busy || !url} onClick={start}>
          {busy ? t("integrations.connecting") : pending ? t("integrations.qcNewCode") : t("integrations.qcGetCode")}
        </Button>
        <ErrorText code={error?.code} detail={error?.detail} className="max-w-sm" />
      </div>
    </div>
  );
}
