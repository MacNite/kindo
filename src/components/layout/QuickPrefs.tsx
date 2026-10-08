"use client";
import { Moon, Sun, SunMoon } from "lucide-react";
import { usePrefs, type Theme } from "@/lib/state/prefs";
import { useI18n } from "@/i18n";
import { cn } from "../ui/cn";

/** Language + theme toggles, reachable from every screen. */
export function QuickPrefs({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  const { prefs, setPrefs } = usePrefs();
  const themeLabel = `${t("settings.appearance.theme")}: ${t(`settings.appearance.${prefs.theme}`)}`;
  const next: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
  const ThemeIcon = prefs.theme === "light" ? Sun : prefs.theme === "dark" ? Moon : SunMoon;
  return (
    <div className={cn("flex items-center gap-1", compact ? "" : "px-1")}>
      <div className="inline-flex rounded-full bg-sunken p-0.5 text-sm font-bold" role="radiogroup" aria-label={t("settings.language.language")}>
        {(["de", "en"] as const).map((l) => (
          <button key={l} role="radio" aria-checked={prefs.language === l} onClick={() => setPrefs({ language: l })}
            className={cn("h-8 w-10 rounded-full uppercase coarse:h-11 coarse:w-11", prefs.language === l ? "bg-surface text-ink" : "text-soft")}>{l}</button>
        ))}
      </div>
      <button onClick={() => setPrefs({ theme: next[prefs.theme] })} aria-label={themeLabel} title={themeLabel}
        className="grid h-9 w-9 place-items-center rounded-full text-soft hover:bg-sunken hover:text-ink coarse:h-11 coarse:w-11">
        <ThemeIcon size={18} />
      </button>
    </div>
  );
}
