"use client";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { useI18n } from "@/i18n";

export function OfflineScreen() {
  const { t } = useI18n();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <WifiOff size={40} className="text-soft" />
      <h1 className="font-display text-3xl font-bold">{t("offline.title")}</h1>
      <p className="max-w-md text-soft">{t("offline.body")}</p>
      <Link href="/shopping" className="font-bold underline">{t("nav.shopping")}</Link>
    </main>
  );
}
