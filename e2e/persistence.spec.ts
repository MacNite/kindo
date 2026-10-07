import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";
import { ADMIN_STATE } from "./logins";

test("a shopping item survives a reload", async ({ page }) => {
  await prepare(page);
  await page.goto("/shopping");
  await page.getByPlaceholder("Add to Groceries").fill("Sourdough");
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.ok());
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Sourdough")).toBeVisible();
  await saved;
  await page.reload();
  await expect(page.getByText("Sourdough")).toBeVisible();
});

test("the wall sees a tick from a phone without reloading (§19.2)", async ({ browser }) => {
  const wall = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  const phone = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  await prepare(wall);
  await prepare(phone);
  await wall.goto("/kids/lena");
  await phone.goto("/kids/lena");
  // Evening routine: nothing ticked there in the demo.
  for (const p of [wall, phone]) await p.getByRole("radio", { name: "Evening" }).click();
  const onWall = wall.getByRole("button", { name: "Pyjamas", exact: true });
  await expect(onWall).toHaveAttribute("aria-pressed", "false");
  await phone.getByRole("button", { name: "Pyjamas", exact: true }).click();
  await expect(onWall).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
  // Clean up for the next run of this test against a reused server.
  await phone.getByRole("button", { name: "Pyjamas", exact: true }).click();
  await expect(onWall).toHaveAttribute("aria-pressed", "false", { timeout: 10_000 });
});

test("a meal planned on one day shows on the meals screen after a reload", async ({ page }) => {
  await prepare(page);
  await page.goto("/meals");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("listitem").first().getByRole("button").click();
  await page.getByLabel("Dinner").fill("Lentil soup");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Lentil soup")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Lentil soup")).toBeVisible();
});

test("a new event lands in the calendar", async ({ page }) => {
  await prepare(page);
  await page.goto("/calendar");
  await page.getByRole("button", { name: "New event" }).click();
  await page.getByLabel("Title").fill("Kindergarten party");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Kindergarten party").filter({ visible: true }).first()).toBeVisible();
});
