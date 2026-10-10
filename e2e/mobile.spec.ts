import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";

test("phones get the bottom navigation and the More sheet", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  const nav = page.locator("nav").last();
  for (const label of ["Home", "Calendar", "Routines", "Shopping", "More"]) await expect(nav.getByText(label, { exact: true })).toBeVisible();
  await nav.getByText("More", { exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Rewards")).toBeVisible();
});

test("the More sheet keeps keyboard focus inside and returns it on close", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  const more = page.locator("nav").last().getByText("More", { exact: true });
  await more.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]") || document.activeElement === document.body)).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("nav").last().getByRole("button", { name: "More" })).toBeFocused();
});

test("the wall goes fullscreen on the first touch and the app leaves it (D56)", async ({ page }) => {
  await prepare(page);
  await page.goto("/wall");
  const fullscreen = () => page.evaluate(() => document.fullscreenElement !== null);
  await page.locator(".wall-clock").tap();
  await expect.poll(fullscreen).toBe(true);
  await page.locator(".wall-actions").getByRole("link", { name: "Home", exact: true }).tap();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(fullscreen).toBe(false);
});
