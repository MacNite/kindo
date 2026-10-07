import { expect, type Page } from "@playwright/test";

/** Starts every test with known device preferences and fails on any page error. */
export async function prepare(page: Page, prefs: { language?: "en" | "de"; theme?: "light" | "dark" } = {}) {
  const value = JSON.stringify({ theme: prefs.theme ?? "light", language: prefs.language ?? "en", region: "de-DE", textSize: "normal" });
  await page.addInitScript((v) => localStorage.setItem("kindo.prefs", v), value);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { assertNoErrors: () => expect(errors, errors.join("\n")).toEqual([]) };
}
