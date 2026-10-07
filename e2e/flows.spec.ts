import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";

test("the home screen shows one lane per family member", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  for (const name of ["Anna", "Max", "Lena", "Paul"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
});

test("switching the language changes the navigation", async ({ page }) => {
  await prepare(page);
  await page.goto("/calendar");
  await expect(page.getByRole("link", { name: "Shopping" })).toBeVisible();
  await page.getByRole("radio", { name: "de" }).click();
  await expect(page.getByRole("link", { name: "Einkauf" })).toBeVisible();
});

test("a child can tick off a routine step by tapping its picture", async ({ page }) => {
  await prepare(page);
  await page.goto("/kids/paul");
  const card = page.locator("button[aria-pressed]").filter({ has: page.locator("svg") }).nth(3);
  const before = await card.getAttribute("aria-pressed");
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
});

test("customize mode hides a widget and offers it again", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("button", { name: "Hide" }).first().click();
  await expect(page.getByText("Hidden cards")).toBeVisible();
  await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
});

test("the wall display opens the photo frame and a tap returns", async ({ page }) => {
  await prepare(page);
  await page.goto("/wall");
  await page.getByRole("button", { name: "Photos" }).click();
  const saver = page.getByRole("button", { name: "Tap to return" });
  await expect(saver).toBeVisible();
  await saver.click();
  await expect(saver).toBeHidden();
});

test("shopping quick-add puts the item on the list", async ({ page }) => {
  await prepare(page);
  await page.goto("/shopping");
  await page.getByPlaceholder("Add to Groceries").fill("Oat milk");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Oat milk")).toBeVisible();
});
