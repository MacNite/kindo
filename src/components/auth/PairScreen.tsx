"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { pollPairing, startPairing } from "@/lib/services/accounts";
import { ErrorText } from "../ui/ErrorText";

/**
 * Pairing a wall display (§19.4, §20 D24): it shows a code and a QR code; an
 * admin confirms it on their phone, and this screen becomes a kiosk with no
 * login of its own.
 */
export function PairScreen() {
  const { t } = useI18n();
  const [pairing, setPairing] = useState<{ code: string; qr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const begin = useCallback(async () => {
    const r = await startPairing();
    if (r.ok) setPairing({ code: r.data.code, qr: r.data.qr });
    else setError(r.error);
  }, []);

  useEffect(() => {
    void begin();
  }, [begin]);

  useEffect(() => {
    if (!pairing) return;
    const id = setInterval(async () => {
      const r = await pollPairing().catch(() => null);
      if (!r?.ok) return;
      if (r.data === "paired") window.location.assign("/wall");
      if (r.data === "expired") void begin();
    }, 2000);
    return () => clearInterval(id);
  }, [pairing, begin]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-8 text-center">
      <h1 className="font-display text-4xl font-bold">{t("pair.title")}</h1>
      <p className="max-w-lg text-lg text-soft">{t("pair.hint")}</p>
      {pairing && (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-12">
          <p role="group" aria-label={t("pair.code")} data-testid="pairing-code" className="num font-display text-7xl font-semibold tracking-[0.15em]">{pairing.code.slice(0, 3)} {pairing.code.slice(3)}</p>
          <div className="h-44 w-44 rounded-panel bg-white p-3 [&>svg]:h-full [&>svg]:w-full" aria-hidden dangerouslySetInnerHTML={{ __html: pairing.qr }} />
        </div>
      )}
      <ErrorText code={error} />
      <Link href="/login" className="text-sm font-bold text-soft hover:text-ink">{t("pair.signInInstead")}</Link>
    </main>
  );
}
