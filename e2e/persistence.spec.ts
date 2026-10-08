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
  // The agenda shows every title in full, however busy the afternoon is.
  await page.getByRole("radio", { name: "Agenda" }).click();
  await expect(page.getByText("Kindergarten party").filter({ visible: true }).first()).toBeVisible();
});

test("a new chore can go to several people at once", async ({ page }) => {
  await prepare(page);
  await page.goto("/routines");
  await page.getByRole("radio", { name: "Chores" }).click();
  await page.getByRole("button", { name: "New chore" }).click();
  const label = `Water herbs ${Date.now()}`;
  await page.getByLabel("Name").fill(label);
  // Anna is picked already; add Lena.
  await page.getByRole("dialog").getByRole("button", { name: "Lena" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.reload();
  await page.getByRole("radio", { name: "Chores" }).click();
  await expect(page.getByRole("button", { name: label })).toHaveCount(2);
});

test("a new routine adds several steps to the block that is already there (D50)", async ({ page }) => {
  await prepare(page);
  await page.goto("/routines");
  await page.getByRole("button", { name: "New routine" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Paul" }).click();
  await dialog.getByRole("radio", { name: "Afternoon" }).click();
  await dialog.getByRole("button", { name: "Make bed" }).click();
  await dialog.getByRole("button", { name: "Shoes on" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  const paul = page.locator("section").filter({ has: page.getByRole("heading", { name: "Paul" }) });
  // Still one afternoon block for Paul, now with the two new steps in it.
  await expect(paul.getByText("Afternoon", { exact: true })).toHaveCount(1);
  await expect(paul.getByRole("button", { name: "Make bed" })).toBeVisible();
  // Paul's morning already had shoes; now his afternoon has them too.
  await expect(paul.getByRole("button", { name: "Shoes on" })).toHaveCount(2);
});

test("routine points are switched on and off per child (D49)", async ({ page }) => {
  await prepare(page);
  await page.goto("/routines");
  const toggle = page.getByRole("switch", { name: "Points for routines: Lena" });
  const saved = () => page.waitForResponse((r) => r.request().method() === "POST" && r.ok());
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  let done = saved();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await done;
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  // The routine tiles show what each step earns now.
  const lena = page.locator("section").filter({ has: page.getByRole("heading", { name: "Lena" }) });
  await expect(lena.getByRole("button", { name: "Make bed" })).toContainText("5");
  done = saved();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await done;
});
