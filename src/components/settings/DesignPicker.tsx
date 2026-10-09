"use client";
import { useId } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/i18n";
import { usePrefs } from "@/lib/state/prefs";
import { DESIGNS } from "@/lib/designs";
import { cn } from "../ui/cn";

/**
 * The design styles (§16, D54), each shown as the wall display in that style.
 * The pictures are screenshots of /wall with the demo family at 1920×1080
 * (public/designs); retake them when a style changes.
 */
export function DesignPicker() {
  const { t } = useI18n();
  const { prefs, setPrefs } = usePrefs();
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`}>
      <p id={`${id}-label`} className="text-sm font-bold">{t("settings.appearance.design")}</p>
      <p id={`${id}-hint`} className="mb-3 text-sm text-soft">{t("settings.appearance.designHint")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {DESIGNS.map((d) => {
          const on = prefs.design === d;
          return (
            <button key={d} type="button" role="radio" aria-checked={on} onClick={() => setPrefs({ design: d })}
              className={cn("group flex flex-col gap-2 rounded-card p-1.5 text-left transition-colors", on ? "bg-sunken" : "hover:bg-sunken/60")}>
              <span className={cn("relative block overflow-hidden rounded-tile ring-2 ring-offset-2 ring-offset-surface", on ? "ring-ink" : "ring-transparent")}>
                <img src={`/designs/${d}.webp`} alt="" width={480} height={270} loading="lazy" className="block aspect-video w-full object-cover" />
                {on && <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-ink text-surface"><Check size={16} strokeWidth={3} /></span>}
              </span>
              <span className="px-1 pb-1 font-bold">{t(`settings.appearance.designs.${d}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
