"use client";
import { useEffect } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n";
import { usePrefs } from "@/lib/state/prefs";
import { BASE_PATH } from "@/lib/basePath";
import { reset } from "../../server/demo/browser";

/** "Get Kindo" leads to the website the demo is published with, one level up (`/kindo/demo` → `/kindo/`). */
const SITE = `${BASE_PATH.replace(/\/demo$/, "")}/`;

/**
 * Says that this is the static demo (§20 D74) and offers to start over. A
 * `?lang=de` from the German website opens the demo in German.
 */
export function DemoBanner() {
  const { t } = useI18n();
  const { setPrefs } = usePrefs();
  useEffect(() => {
    const lang = new URLSearchParams(window.location.search).get("lang");
    if (lang === "de" || lang === "en") setPrefs({ language: lang });
    // Only the address the demo was opened with counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-ink px-4 py-2 text-center text-sm text-surface">
      <span className="flex items-center gap-2 font-bold"><Sparkles size={16} className="shrink-0" />{t("demo.banner")}</span>
      <span className="flex items-center gap-4">
        <button type="button" onClick={() => { reset(); window.location.reload(); }} className="flex items-center gap-1.5 font-bold underline underline-offset-4">
          <RotateCcw size={14} />{t("demo.reset")}
        </button>
        <a href={SITE} className="font-bold underline underline-offset-4">{t("demo.get")}</a>
      </span>
    </div>
  );
}
