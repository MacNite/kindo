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
