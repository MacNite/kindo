import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";

/** Needs a CalDAV server with a calendar (Radicale in CI): CALDAV_TEST_URL, CALDAV_TEST_USER, CALDAV_TEST_PASSWORD. */
const URL_ = process.env.CALDAV_TEST_URL;

test.skip(!URL_, "no CalDAV server configured");

test("connect Nextcloud in Settings, then write an event to it (§19.5)", async ({ page }) => {
  await prepare(page);
  await page.goto("/settings?section=integrations");
  await page.getByRole("button", { name: "Set up" }).first().click();
  await page.getByLabel("Server address").fill(URL_!);
  await page.getByLabel("Username").fill(process.env.CALDAV_TEST_USER ?? "anna");
  await page.getByLabel("App password").fill(process.env.CALDAV_TEST_PASSWORD ?? "app-password");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(/synced/).first()).toBeVisible();

  // The calendar shows up in Settings → Calendar; give it to Lena.
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("listitem").getByRole("button", { name: /family.*Nextcloud/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Lena" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // Write an event into it from the calendar.
  await page.goto("/calendar");
  await page.getByRole("button", { name: "New event" }).click();
  await page.getByLabel("Title").fill("Swimming at Nextcloud");
  const select = page.getByRole("dialog").getByRole("combobox");
  const value = await select.locator("option").filter({ hasText: /family \(Nextcloud\)/ }).getAttribute("value");
  await select.selectOption(value!);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText("Swimming at Nextcloud").filter({ visible: true }).first()).toBeVisible();
});
