import { expect, test, type Page } from "@playwright/test";
import { householdTime, prepare } from "./helpers";

// The wall's "Next up" line (D69). The demo family has Anna's haircut at 14:00 and Max's call
// with the landlord at 17:30 every day, beside school and Kita in the background.
const line = (page: Page) => page.locator(".wall-next");

test("Next up shows the household's next timed commitment, keeps it as 'now' for ten minutes, then moves on", async ({ page }) => {
  await page.clock.install({ time: householdTime(13, 0) });
  const { assertNoErrors } = await prepare(page);
  await page.goto("/wall");
  // School and Kita run until after one, but background events never take the slot.
  await expect(line(page)).toContainText("Next up");
  await expect(line(page)).toContainText("14:00");
  await expect(line(page)).toContainText("Haircut");
  await expect(line(page)).toContainText("Anna");
  await expect(line(page)).toHaveAttribute("aria-label", /Next up, 14:00, Haircut, Anna/);

  await page.clock.fastForward("01:05:00");
  await expect(line(page).getByText("Now", { exact: true })).toBeVisible();
  await expect(line(page)).toContainText("Haircut");

  // After ten minutes the haircut is still on in Anna's lane, but Next up has moved on.
  await page.clock.fastForward("10:00");
  await expect(line(page)).not.toContainText("Haircut");
  await expect(line(page)).not.toContainText("Now");
  await expect(page.locator("section.lane").filter({ hasText: "Anna" })).toContainText("Haircut");
  assertNoErrors();
});

test("Next up shows events at the same time together and cuts a long title to its line", async ({ page }) => {
  await page.clock.install({ time: householdTime(13, 0) });
  await prepare(page);
  const title = "Parent–teacher conference about the after-school care timetable for the spring term";
  await page.goto("/calendar");
  await page.getByRole("button", { name: "New event" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Max" }).click();
  await dialog.getByRole("button", { name: "Anna" }).click();
  await dialog.getByLabel("From").fill("14:00");
  await dialog.getByLabel("Until").fill("15:00");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  try {
    for (const size of [{ width: 1024, height: 600 }, { width: 1280, height: 800 }, { width: 800, height: 1280 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      await page.goto("/wall");
      // The event for two people comes first; the haircut at the same minute is counted below it.
      await expect(line(page)).toHaveAttribute("aria-label", new RegExp(`14:00, ${title}, Anna & Max`));
      await expect(line(page)).toBeVisible();
      const box = (await line(page).boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      // Nothing spills out of the line: a long title is cut short (on a phone it wraps).
      const fits = await line(page).evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1 || `${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}`);
      await page.screenshot({ path: `test-results/next-up-${size.width}x${size.height}.png` });
      expect(fits).toBe(true);
    }
    await expect(line(page)).toHaveAttribute("aria-label", /\+1 more at the same time/);
  } finally {
    await page.goto("/calendar");
    await page.getByRole("radio", { name: "Agenda" }).click();
    await page.getByText(title).filter({ visible: true }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete event" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
});

test("Next up looks ahead to tomorrow in the evening", async ({ page }) => {
  // Late in the evening nothing timed is left today, whatever the weekday (Yoga on Mondays ends at 20:45,
  // Handball on Thursdays at 21:30); Paul's dentist is tomorrow at ten, if nothing is earlier.
  await page.clock.install({ time: householdTime(21, 45) });
  await prepare(page);
  await page.goto("/wall");
  await expect(line(page)).toContainText("Tomorrow");
  await expect(line(page)).not.toContainText("landlord");
});

test("Next up says so when the wall has lost the server for a minute, and not before", async ({ page }) => {
  await page.clock.install({ time: householdTime(13, 0) });
  await prepare(page);
  // The live connection never gets through, as when the server restarts or the Wi-Fi has no way out.
  await page.route("**/api/stream", (route) => route.abort());
  await page.goto("/wall");
  await expect(line(page)).toContainText("Haircut");
  // The mark, not its word: on a narrow line (other events beside it) only the icon shows.
  const offline = line(page).getByTitle("No connection: showing what this screen last knew.");
  await expect(offline).toHaveCount(0);
  await page.clock.fastForward("01:05");
  await expect(offline).toBeVisible();
  // What it last knew stays, marked as such.
  await expect(line(page)).toContainText("Haircut");
  await expect(line(page)).toHaveAttribute("aria-label", /showing what this screen last knew/);
});
