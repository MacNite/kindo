import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";

const SERVICES = `http://127.0.0.1:${process.env.IMMICH_MOCK_PORT ?? 3198}`;
const HA = `http://127.0.0.1:${process.env.HA_MOCK_PORT ?? 3197}`;

test("subscribe to an ICS feed for one person (§19.8)", async ({ page }) => {
  await prepare(page);
  await page.goto("/settings?section=integrations");
  await page.getByTestId("integration-ics").getByRole("button", { name: /Set up|Add another/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Holidays BW");
  await dialog.getByLabel("Feed address").fill(`${SERVICES}/feeds/school.ics`);
  await dialog.getByRole("button", { name: "Lena" }).click();
  await dialog.getByRole("button", { name: "Subscribe" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Holidays BW" })).toBeVisible();
});

test("Home Assistant presence wakes the wall and lets it go back to photos (§13)", async ({ page, request }) => {
  await request.post(`${HA}/__state`, { data: { state: "off" } });
  await prepare(page);
  await page.goto("/settings?section=integrations");
  await page.getByTestId("integration-homeassistant").getByRole("button", { name: /Set up|Add another/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Server address").fill(HA);
  await dialog.getByLabel("Long-lived access token").fill("e2e-home-assistant-long-lived-token");
  await dialog.getByLabel("Presence sensor").fill("binary_sensor.hallway_motion");
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  await page.goto("/wall");
  const saver = page.getByRole("button", { name: "Tap to return" });
  // Presence is news, not data: wait until the wall listens live.
  await expect(page.locator("[data-sync=live]")).toBeAttached();
  await request.post(`${HA}/__state`, { data: { state: "on" } });
  await request.post(`${HA}/__state`, { data: { state: "off" } });
  await expect(saver).toBeVisible({ timeout: 15_000 });
  await request.post(`${HA}/__state`, { data: { state: "on" } });
  await expect(saver).toBeHidden({ timeout: 15_000 });
});

test("Home control: switches, everything off and solar, on its page and on the wall (§21)", async ({ page, request }) => {
  const { assertNoErrors } = await prepare(page);
  await request.post(`${HA}/__reset`);
  await page.goto("/settings?section=integrations");
  const card = page.getByTestId("integration-homeassistant");
  // A fresh start: a new connection keeps the old one's switches, so the old one goes first.
  page.on("dialog", (d) => void d.accept());
  const disconnect = card.getByRole("button", { name: "Disconnect" });
  if (await disconnect.count()) {
    await disconnect.click();
    await expect(disconnect).toHaveCount(0);
  }
  await card.getByRole("button", { name: "Set up" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Server address").fill(HA);
  await dialog.getByLabel("Long-lived access token").fill("e2e-home-assistant-long-lived-token");
  // Presence is optional now: Home Assistant just for Home control.
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  await card.getByRole("button", { name: "Home control" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Kitchen light/ }).click();
  await dialog.getByRole("button", { name: /Coffee machine/ }).click();
  await expect(dialog.getByRole("button", { name: /Front door/ })).toHaveCount(0);
  await dialog.getByLabel("Name for light.kitchen").fill("Kitchen");
  await dialog.getByLabel("Solar power").selectOption("sensor.solar_power");
  await dialog.getByLabel(/^Feed-in/).selectOption("sensor.grid_feed_in");
  await dialog.getByLabel(/^Grid draw/).selectOption("sensor.grid_draw");
  // The house is worked out from the three unless a sensor is picked for it.
  await expect(dialog.getByLabel("House consumption")).toHaveValue("");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name: "Home control" }).first().click();
  await expect(page).toHaveURL(/\/home-control/);
  await expect(page.getByTestId("energy-solar")).toContainText("3,2");
  await expect(page.getByTestId("energy-house")).toContainText("1,2");
  await expect(page.getByTestId("energy-grid")).toContainText("Into the grid");
  const kitchen = page.getByRole("switch", { name: "Kitchen" });
  await expect(kitchen).toHaveAttribute("aria-checked", "true");
  await kitchen.click();
  await expect(kitchen).toHaveAttribute("aria-checked", "false");

  // Everything off asks once, then switches every switch Kindo shows.
  await page.getByRole("button", { name: "Everything off" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Turn everything off" }).click();
  await expect(page.getByRole("switch", { name: "Coffee machine" })).toHaveAttribute("aria-checked", "false");

  // The wall shows it only once the household turns the tile on.
  await page.goto("/settings?section=dashboard");
  await page.getByRole("switch", { name: "Home control" }).click();
  await expect(page.getByRole("switch", { name: "Home control" })).toHaveAttribute("aria-checked", "true");
  await page.goto("/wall");
  const tile = page.getByTestId("home-tile");
  await expect(tile).toBeVisible();
  await request.post(`${HA}/__power`, { data: { solar: "0.5", feedIn: "0", draw: "700" } });
  await tile.getByRole("switch", { name: "Kitchen" }).click();
  await expect(tile.getByRole("switch", { name: "Kitchen" })).toHaveAttribute("aria-checked", "true");
  await expect(tile.getByTestId("energy-solar")).toContainText("500");
  assertNoErrors();

  // Leave the wall as the other tests expect it.
  await page.goto("/settings?section=dashboard");
  await page.getByRole("switch", { name: "Home control" }).click();
  await expect(page.getByRole("switch", { name: "Home control" })).toHaveAttribute("aria-checked", "false");
});

test("school holidays from the feed show in the calendar (§5, D41)", async ({ page }) => {
  const { assertNoErrors } = await prepare(page);
  await page.goto("/settings?section=routines");
  const feeds = page.getByLabel("School holidays from");
  await feeds.fill(`${SERVICES}/feeds/holidays.ics`);
  await page.getByRole("button", { name: "Save and fetch" }).click();
  await expect(page.getByText(/Fetched .*: 1 holiday periods/)).toBeVisible({ timeout: 20_000 });

  await page.goto("/calendar");
  await expect(page.getByTitle("School holidays: Testferien").first()).toBeVisible();
  await page.getByRole("radio", { name: "Agenda" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Testferien" })).toHaveCount(1);
  assertNoErrors();

  // Leave the school days as the other tests expect them.
  await page.goto("/settings?section=routines");
  await feeds.fill("");
  await page.getByRole("button", { name: "Save and fetch" }).click();
  await expect(page.getByText("No feeds: every Monday to Friday counts as a school day.")).toBeVisible();
});
