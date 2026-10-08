import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";

const HA = `http://127.0.0.1:${process.env.HA_MOCK_PORT ?? 3197}`;
const FRIGATE = `http://127.0.0.1:${process.env.FRIGATE_MOCK_PORT ?? 3196}`;

test.use({ permissions: ["microphone"] });

test("Frigate cameras: set up, ring on the wall over the photos, and talk back (§22)", async ({ page, request }) => {
  const { assertNoErrors } = await prepare(page);
  await request.post(`${FRIGATE}/__reset`);
  await page.goto("/settings?section=integrations");

  // Rings come from Home Assistant's visitor sensor.
  await page.getByTestId("integration-homeassistant").getByRole("button", { name: /Set up|Add another/ }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Server address").fill(HA);
  await dialog.getByLabel("Long-lived access token").fill("e2e-home-assistant-long-lived-token");
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  const card = page.getByTestId("integration-frigate");
  await card.getByRole("button", { name: /Set up|Add another/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Server address").fill(FRIGATE);
  await dialog.getByLabel("Username").fill("kindo");
  await dialog.getByLabel("Password", { exact: true }).fill("wrong");
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible({ timeout: 20_000 });
  await dialog.getByLabel("Password", { exact: true }).fill("frigate-e2e-password");
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  await card.getByRole("button", { name: "Cameras" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "front_door" }).click();
  const row = dialog.getByTestId("camera-setup-front-door");
  // The two-way twin is found on its own; the doorbell button is picked from Home Assistant.
  await expect(row.getByLabel("Talk stream")).toHaveValue("front_door_twt");
  await row.getByLabel("Doorbell button").selectOption("binary_sensor.front_door_visitor");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  // The wall: photos on, then someone rings.
  await page.goto("/wall");
  await expect(page.locator("[data-sync=live]")).toBeAttached();
  await page.getByRole("button", { name: "Photos" }).click();
  const saver = page.getByRole("button", { name: "Tap to return" });
  await expect(saver).toBeVisible();
  await request.post(`${HA}/__ring`);
  const live = page.getByTestId("live-camera");
  await expect(live).toBeVisible({ timeout: 15_000 });
  await expect(live).toContainText("Someone is at the door");
  await expect(live).toContainText("Front door");
  // The wall views without the PIN; it asked go2rtc for the camera's own stream, receiving only.
  await expect.poll(async () => (await (await request.get(`${FRIGATE}/__calls`)).json()).calls).toContainEqual({ src: "front_door", sendsAudio: false });
  await live.getByRole("button", { name: "Dismiss" }).click();
  await expect(live).toBeHidden();
  // Back to where it was: the photo frame.
  await expect(saver).toBeVisible();

  // An adult talks: Talk takes the camera and opens the two-way stream with the microphone, muted until held.
  await page.goto("/cameras");
  await page.getByRole("button", { name: "Watch Front door live" }).click();
  await expect(live).toBeVisible();
  await live.getByRole("button", { name: "Talk" }).click();
  await expect(live.getByRole("status").filter({ hasText: "Microphone off" })).toBeVisible();
  await expect.poll(async () => (await (await request.get(`${FRIGATE}/__calls`)).json()).calls).toContainEqual({ src: "front_door_twt", sendsAudio: true });
  const hold = live.getByRole("button", { name: "Hold to talk" });
  await hold.dispatchEvent("pointerdown");
  await expect(live.getByRole("status").filter({ hasText: "Microphone on" })).toBeVisible();
  await live.getByRole("button", { name: "Talking…" }).dispatchEvent("pointerup");
  await expect(live.getByRole("status").filter({ hasText: "Microphone off" })).toBeVisible();
  await live.getByRole("button", { name: "Close" }).click();
  await expect(live).toBeHidden();

  // Leave no cameras (and so no ring still going on) for the other tests.
  await page.goto("/settings?section=integrations");
  page.on("dialog", (d) => void d.accept());
  await card.getByRole("button", { name: "Disconnect" }).click();
  await expect(card.getByRole("button", { name: "Disconnect" })).toHaveCount(0);
  assertNoErrors();
});
