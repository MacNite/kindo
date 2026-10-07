"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import en, { type Messages } from "./messages/en";
import de from "./messages/de";
import { REGIONS, type Language } from "./config";
import { usePrefs } from "@/lib/state/prefs";
import type { Text, Weekday } from "@/lib/types";
import { daysUntil } from "@/lib/dates";

const CATALOG: Record<Language, Messages> = { en, de };

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Messages>;

function lookup(m: Messages, key: string): string {
  const v = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], m);
  return typeof v === "string" ? v : key;
}

function makeI18n(language: Language, regionId: keyof typeof REGIONS) {
  const region = REGIONS[regionId];
  const messages = CATALOG[language];
  // Formats come from the region, but month/weekday names follow the UI language.
  const loc = `${language}-${regionId.split("-")[1]}`;
  const hour12 = region.hour12;

  const t = (key: MessageKey, vars?: Record<string, string | number>) => {
    let s = lookup(messages, key);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
  const tx = (text: Text) => (typeof text === "string" ? text : text[language]);

  const df = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc, o);
  const fmt = {
    time: (d: Date) => df({ hour: "numeric", minute: "2-digit", hour12 }).format(d),
    clock: (d: Date) => df({ hour: hour12 ? "numeric" : "2-digit", minute: "2-digit", hour12 }).format(d).replace(/\s?[AP]M$/i, ""),
    meridiem: (d: Date) => (hour12 ? (d.getHours() < 12 ? "AM" : "PM") : ""),
    dateLong: (d: Date) => df({ weekday: "long", day: "numeric", month: "long" }).format(d),
    dateMedium: (d: Date) => df({ day: "numeric", month: "short" }).format(d),
    dateShort: (d: Date) => df({ day: "2-digit", month: "2-digit", year: "numeric" }).format(d),
    weekday: (d: Date, style: "long" | "short" | "narrow" = "short") => df({ weekday: style }).format(d),
    monthYear: (d: Date) => df({ month: "long", year: "numeric" }).format(d),
    dayNum: (d: Date) => df({ day: "numeric" }).format(d),
    num: (n: number) => new Intl.NumberFormat(loc).format(n),
    money: (n: number) => new Intl.NumberFormat(loc, { style: "currency", currency: region.currency }).format(n),
    /** "Today", "Tomorrow", "in 4 days" */
    relDay: (d: Date, from = new Date()) => {
      const n = daysUntil(from, d);
      if (n === 0) return t("common.today");
      if (n === 1) return t("common.tomorrow");
      if (n === -1) return t("common.yesterday");
      return n > 1 ? t("common.inDays", { n }) : fmt.dateMedium(d);
    },
  };

  /** Weekday names by JS index (0 = Sunday), from a fixed reference week. */
  const weekdayName = (day: Weekday, style: "long" | "short" | "narrow" = "long") => fmt.weekday(new Date(2024, 0, 7 + day), style);
  /** Weekdays ordered by the region's week start. */
  const weekOrder: Weekday[] = region.weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];

  return { language, region, t, tx, fmt, weekdayName, weekOrder };
}

export type I18n = ReturnType<typeof makeI18n>;
const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const value = useMemo(() => makeI18n(prefs.language, prefs.region), [prefs.language, prefs.region]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside I18nProvider");
  return c;
}
