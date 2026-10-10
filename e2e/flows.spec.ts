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

test("the wall opens a child's view from their lane's header and shows the coming days' weather (D60)", async ({ page }) => {
  await prepare(page);
  await page.goto("/wall");
  // The demo weather has five days ahead; however many fit, at least three show.
  await expect(page.locator(".wall-forecast > li").filter({ visible: true }).nth(2)).toBeVisible();
  await expect(page.getByRole("link", { name: "Child view: Paul" })).toBeVisible();
  await page.locator(".lane-open").filter({ hasText: "Paul" }).getByRole("heading", { name: "Paul" }).click();
  await expect(page).toHaveURL(/\/kids\/paul$/);
});

test("the wall shows what each child has collected", async ({ page }) => {
  await prepare(page);
  await page.goto("/wall");
  await expect(page.getByLabel("What Lena has collected")).toHaveText(/\d/);
  await expect(page.getByLabel("What Paul has collected")).toHaveText(/\d/);
});

test("shopping quick-add puts the item on the list", async ({ page }) => {
  await prepare(page);
  await page.goto("/shopping");
  await page.getByPlaceholder("Add to Groceries").fill("Oat milk");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Oat milk")).toBeVisible();
});

test("the wall rolls over to the new day at midnight", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 7, 23, 59, 0) });
  await prepare(page);
  await page.goto("/wall");
  await expect(page.getByText("Wednesday, 7 October").first()).toBeAttached();
  await page.clock.runFor(120_000);
  await expect(page.getByText("Thursday, 8 October").first()).toBeAttached();
  // Not just the clock: nothing on the wall may still be showing yesterday.
  await expect(page.getByText("Wednesday, 7 October")).toHaveCount(0);
});

test("a task added by mistake can be deleted", async ({ page }) => {
  await prepare(page);
  await page.goto("/tasks");
  await page.getByPlaceholder("What needs doing?").fill("Typo task");
  await page.getByRole("button", { name: "Add a task" }).click();
  await expect(page.getByText("Typo task")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete “Typo task”" }).click();
  await expect(page.getByText("Typo task")).toBeHidden();
});
