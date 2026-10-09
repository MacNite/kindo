import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";

test("a design style is picked per device and can fix the colour scheme", async ({ page }) => {
  const { assertNoErrors } = await prepare(page);
  await page.goto("/settings?section=appearance");
  const html = page.locator("html");
  const styles = page.getByRole("radiogroup", { name: "Style" });
  await expect(styles.getByRole("radio")).toHaveCount(5);
  await expect(styles.getByRole("radio", { name: "Warm" })).toBeChecked();

  await styles.getByRole("radio", { name: "Futuristic" }).click();
  await expect(html).toHaveAttribute("data-design", "future");
  await expect(html).toHaveClass(/\bdark\b/);
  await expect(page.getByText("Futuristic is always dark.")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Light", exact: true })).toBeDisabled();

  await styles.getByRole("radio", { name: "Glass" }).click();
  await expect(html).toHaveAttribute("data-design", "glass");
  await expect(html).not.toHaveClass(/\bdark\b/);

  await styles.getByRole("radio", { name: "Minimal" }).click();
  await expect(page.getByRole("radio", { name: "Dark", exact: true })).toBeEnabled();
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(html).toHaveClass(/\bdark\b/);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("kindo.prefs") ?? "{}"))).toMatchObject({ design: "minimal", theme: "dark" });
  assertNoErrors();
});

test("the wall shows the device's style from the first paint", async ({ page }) => {
  const { assertNoErrors } = await prepare(page, { design: "future", theme: "light" });
  await page.goto("/wall");
  await expect(page.locator("html")).toHaveAttribute("data-design", "future");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.locator(".lane").first()).toBeVisible();
  assertNoErrors();
});

test("Appearance names everyone's colour, and an admin changes it there", async ({ page }) => {
  const { assertNoErrors } = await prepare(page);
  await page.goto("/settings?section=appearance");
  const paul = page.getByRole("button", { name: "Colour: Paul" });
  await expect(paul).toContainText("Paul");
  const before = await paul.evaluate((el) => getComputedStyle(el).backgroundColor);

  await paul.click();
  const colours = page.getByRole("radiogroup", { name: "Colour: Paul" });
  const original = (await colours.getByRole("radio", { checked: true }).getAttribute("aria-label"))!;
  const other = (await colours.getByRole("radio", { checked: false }).first().getAttribute("aria-label"))!;
  await colours.getByRole("radio", { name: other }).click();
  await expect(colours.getByRole("radio", { name: other })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("button", { name: "Colour: Paul" })).not.toHaveCSS("background-color", before);

  // Back as it was, for the other tests.
  await page.getByRole("button", { name: "Colour: Paul" }).click();
  await page.getByRole("radiogroup", { name: "Colour: Paul" }).getByRole("radio", { name: original }).click();
  await expect(page.getByRole("button", { name: "Colour: Paul" })).toHaveCSS("background-color", before);
  assertNoErrors();
});
