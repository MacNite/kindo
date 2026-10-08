import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";

// The demo family's birthdays (§12, D46): Oma Ingrid (an important date) in 4 days,
// Oma Biggy (a contact renamed in Kindo) in 5, Lena in 12.

test("the birthday wheel starts at the next birthday and a tap shows another", async ({ page }) => {
  const { assertNoErrors } = await prepare(page);
  await page.goto("/calendar?view=birthdays");
  const wheel = page.getByRole("group", { name: "Birthdays in the year" });
  await expect(wheel.getByText("Oma Ingrid", { exact: true })).toBeVisible();
  await expect(wheel.getByText("4 days", { exact: true })).toBeVisible();
  await expect(wheel.getByText("4 more sleeps")).toBeVisible();

  await wheel.getByRole("button", { name: /^Oma Biggy,/ }).click();
  await expect(wheel.getByText("Oma Biggy", { exact: true })).toBeVisible();
  await expect(wheel.getByText("turns 75")).toBeVisible();
  await expect(wheel.getByText("5 days", { exact: true })).toBeVisible();

  // A contact the household didn't pick stays off the wheel.
  await expect(page.getByText("Peter Vogt (Büro)")).toHaveCount(0);
  assertNoErrors();
});

test("an important day is added from the calendar and lands on the wheel", async ({ page }) => {
  await prepare(page);
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Important day" }).click();
  const dialog = page.getByRole("dialog", { name: "Important day" });
  await dialog.getByRole("radio", { name: "Birthday" }).click();
  await dialog.getByLabel("Name").fill("Uroma Hilde");
  await dialog.locator("input[type=date]").fill("1938-11-25");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("radio", { name: "Birthdays" }).click();
  await expect(page.getByRole("button", { name: /^Uroma Hilde,/ })).toBeVisible();
});

test("a contact gets its own name in Kindo", async ({ page }) => {
  await prepare(page);
  await page.goto("/settings?section=birthdays");
  await expect(page.getByRole("cell", { name: "Mama Müller", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Show: Peter Vogt (Büro)" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByLabel("Name in Kindo for Mama Müller")).toHaveValue("Oma Biggy");
  const ben = page.getByLabel("Name in Kindo for Ben Schröder");
  await ben.fill("Ben aus der Kita");
  await ben.press("Enter");
  await page.goto("/calendar?view=birthdays");
  await expect(page.getByRole("button", { name: /^Ben aus der Kita,/ })).toBeVisible();
});

test("the wall display shows the birthday wheel once it is switched on", async ({ page }) => {
  await prepare(page);
  await page.goto("/settings?section=dashboard");
  const tile = page.getByRole("switch", { name: "Birthday wheel" });
  await expect(tile).toHaveAttribute("aria-checked", "false");
  await tile.click();
  await expect(tile).toHaveAttribute("aria-checked", "true");
  await page.goto("/wall");
  await expect(page.getByText("Next up")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Oma Ingrid,/ }).first()).toBeVisible();
  // Leave the wall as the other tests expect it.
  await page.goto("/settings?section=dashboard");
  await page.getByRole("switch", { name: "Birthday wheel" }).click();
  await expect(page.getByRole("switch", { name: "Birthday wheel" })).toHaveAttribute("aria-checked", "false");
});

test("the wall display opens the birthday wheel full screen and closes it again", async ({ page }) => {
  const { assertNoErrors } = await prepare(page);
  await page.goto("/wall");
  await page.getByRole("button", { name: "Birthdays", exact: true }).click();
  const full = page.getByRole("dialog", { name: "Birthdays" });
  const wheel = full.getByRole("group", { name: "Birthdays in the year" });
  await expect(wheel.getByText("Oma Ingrid", { exact: true })).toBeVisible();
  await wheel.getByRole("button", { name: /^Lena,/ }).click();
  await expect(wheel.getByText("turns 8")).toBeVisible();
  await full.getByRole("button", { name: "Close" }).click();
  await expect(full).toBeHidden();
  assertNoErrors();
});
