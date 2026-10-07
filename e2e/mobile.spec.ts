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
