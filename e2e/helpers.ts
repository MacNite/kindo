import { expect, type Page } from "@playwright/test";
import type { Design } from "../src/lib/designs";

/** Starts every test with known device preferences and fails on any page error. */
export async function prepare(page: Page, prefs: { language?: "en" | "de"; theme?: "light" | "dark"; design?: Design } = {}) {
  const value = JSON.stringify({ theme: prefs.theme ?? "light", language: prefs.language ?? "en", region: "de-DE", textSize: "normal", design: prefs.design ?? "warm" });
  await page.addInitScript((v) => localStorage.setItem("kindo.prefs", v), value);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { assertNoErrors: () => expect(errors, errors.join("\n")).toEqual([]) };
}

/** Today at hh:mm on the household's clock; the demo seed takes its time zone from TZ. */
export function householdTime(h: number, m: number): Date {
  const timeZone = process.env.TZ || "Europe/Berlin";
  const now = new Date();
  const guess = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(guess).map((x) => [x.type, Number(x.value)]));
  const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return new Date(guess - (shown - guess));
}
