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
  // With every tile on, a strip only has room for the next birthday; the column beside the lanes shows the wheel too (D57).
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/wall");
  await expect(page.getByText("Next up")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Oma Ingrid,/ }).first()).toBeVisible();
  // Leave the wall as the other tests expect it.
  await page.goto("/settings?section=dashboard");
  await page.getByRole("switch", { name: "Birthday wheel" }).click();
  await expect(page.getByRole("switch", { name: "Birthday wheel" })).toHaveAttribute("aria-checked", "false");
});

test("a tap on the wall's birthday tile opens the wheel full screen and closes it again (D60)", async ({ page }) => {
  const { assertNoErrors } = await prepare(page);
  await page.goto("/settings?section=dashboard");
  const tile = page.getByRole("switch", { name: "Birthday wheel" });
  await tile.click();
  await expect(tile).toHaveAttribute("aria-checked", "true");
  await page.goto("/wall");
  // The tile itself is the way in, wherever it is tapped: there is no separate button any more.
  await page.getByText("Next up").click({ force: true });
  const full = page.getByRole("dialog", { name: "Birthdays" });
  const wheel = full.getByRole("group", { name: "Birthdays in the year" });
  await expect(wheel.getByText("Oma Ingrid", { exact: true })).toBeVisible();
  await wheel.getByRole("button", { name: /^Lena,/ }).click();
  await expect(wheel.getByText("turns 8")).toBeVisible();
  await full.getByRole("button", { name: "Close" }).click();
  await expect(full).toBeHidden();
  assertNoErrors();
  // Leave the wall as the other tests expect it.
  await page.goto("/settings?section=dashboard");
  await page.getByRole("switch", { name: "Birthday wheel" }).click();
  await expect(page.getByRole("switch", { name: "Birthday wheel" })).toHaveAttribute("aria-checked", "false");
});

test("a contact is muted until it gets its own colour or photo (D61)", async ({ page }) => {
  const { assertNoErrors } = await prepare(page);
  await page.goto("/calendar?view=birthdays");
  const wheel = page.getByRole("group", { name: "Birthdays in the year" });
  const dot = wheel.getByRole("button", { name: /^Oma Biggy,/ });
  // Oma Biggy belongs to Max, but takes the muted colour, not his.
  await expect(dot.locator("circle").nth(1)).toHaveAttribute("fill", "rgb(var(--contact))");

  await page.goto("/settings?section=birthdays");
  await page.getByRole("button", { name: "Colour and photo of Oma Biggy" }).click();
  const look = page.getByRole("radiogroup", { name: "Colour and photo of Oma Biggy" });
  await expect(look.getByRole("radio", { name: "Muted" })).toHaveAttribute("aria-checked", "true");
  await look.getByRole("radio", { name: "Green" }).click();
  await expect(look.getByRole("radio", { name: "Green" })).toHaveAttribute("aria-checked", "true");
  await page.goto("/calendar?view=birthdays");
  await expect(dot.locator("circle").nth(1)).toHaveAttribute("fill", "#2E8B6E");

  // Any picture will do: a screenshot of the wheel itself.
  const picture = await wheel.screenshot();
  await page.goto("/settings?section=birthdays");
  await page.getByRole("button", { name: "Colour and photo of Oma Biggy" }).click();
  await page.locator("input[type=file]").setInputFiles({ name: "oma.png", mimeType: "image/png", buffer: picture });
  await expect(page.getByRole("button", { name: "Remove photo" })).toBeVisible();
  await page.goto("/calendar?view=birthdays");
  const image = dot.locator("image");
  await expect(image).toHaveAttribute("href", /^\/api\/contacts\/.+\/photo\?v=\d+$/);
  const res = await page.request.get((await image.getAttribute("href"))!);
  expect([res.status(), res.headers()["content-type"]]).toEqual([200, "image/jpeg"]);

  await page.goto("/settings?section=birthdays");
  await page.getByRole("button", { name: "Colour and photo of Oma Biggy" }).click();
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByRole("button", { name: "Upload photo" })).toBeVisible();
  assertNoErrors();
});
