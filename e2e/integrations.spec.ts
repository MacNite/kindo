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
