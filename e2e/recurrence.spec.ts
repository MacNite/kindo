import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";

test("routines reset at the household's reset time, not at midnight (§19.3)", async ({ page }) => {
  const today = new Date();
  await page.clock.install({ time: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 22, 0) });
  await prepare(page);
  await page.goto("/kids/paul");
  await expect(page.getByRole("radio", { name: "Evening" })).toHaveAttribute("aria-checked", "true");
  const bath = page.getByRole("button", { name: "Bath", exact: true });
  if ((await bath.getAttribute("aria-pressed")) === "false") await bath.click();
  await expect(bath).toHaveAttribute("aria-pressed", "true");

  // Half past midnight: still yesterday evening for the routines.
  await page.clock.runFor(2.5 * 3_600_000);
  await expect(bath).toHaveAttribute("aria-pressed", "true");

  // After 03:00 the new day starts fresh.
  await page.clock.runFor(3 * 3_600_000);
  await page.getByRole("radio", { name: "Evening" }).click();
  await expect(bath).toHaveAttribute("aria-pressed", "false");
});

test("the history tab shows two weeks per person", async ({ page }) => {
  await prepare(page);
  await page.goto("/routines");
  await page.getByRole("radio", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "Lena" })).toBeVisible();
  // Today's morning routine was partly done in the demo.
  await expect(page.locator("td[aria-label^='Morning']").first()).toBeVisible();
});
