"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Language, RegionId } from "@/i18n/config";
import { isDark, isDesign, type Design } from "@/lib/designs";

export type Theme = "light" | "dark" | "system";
export interface Prefs { theme: Theme; language: Language; region: RegionId; textSize: "normal" | "large"; design: Design }

const KEY = "kindo.prefs";
const Ctx = createContext<{ prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void } | null>(null);

function initial(): Prefs {
  const fallback: Prefs = { theme: "system", language: "en", region: "de-DE", textSize: "normal", design: "warm" };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const p = { ...fallback, ...JSON.parse(saved) };
      return isDesign(p.design) ? p : { ...p, design: "warm" };
    }
  } catch {}
  return { ...fallback, language: navigator.language?.toLowerCase().startsWith("de") ? "de" : "en" };
}

/** Device-level preferences. Later these become per-device + per-user settings. */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, set] = useState<Prefs>(initial);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
    document.documentElement.lang = prefs.language;
    document.documentElement.style.fontSize = prefs.textSize === "large" ? "18px" : "";
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    document.documentElement.dataset.design = prefs.design;
    const apply = () => document.documentElement.classList.toggle("dark", isDark(prefs.theme, prefs.design, mq.matches));
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [prefs]);

  return <Ctx.Provider value={{ prefs, setPrefs: (p) => set((s) => ({ ...s, ...p })) }}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePrefs outside PrefsProvider");
  return c;
}
