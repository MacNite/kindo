import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";
import { ADMIN_STATE, E2E_PIN } from "./logins";

const MEDIA = `http://127.0.0.1:${process.env.MEDIA_MOCK_PORT ?? 3195}`;
const HA = `http://127.0.0.1:${process.env.HA_MOCK_PORT ?? 3197}`;

test.use({ permissions: ["microphone"] });

test("the kids' shelf: Jellyfin set up behind the cog, played here and on a speaker, and talking to Home Assistant (§23, §24)", async ({ page, request }) => {
  test.setTimeout(90_000);
  const { assertNoErrors } = await prepare(page);
  await request.post(`${MEDIA}/__reset`);
  await request.post(`${HA}/__reset`);
  page.on("dialog", (d) => void d.accept());
  await page.goto("/settings?section=integrations");

  // Home Assistant for the speaker and talking.
  const haCard = page.getByTestId("integration-homeassistant");
  await haCard.getByRole("button", { name: /Set up|Add another/ }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Server address").fill(HA);
  await dialog.getByLabel("Long-lived access token").fill("e2e-home-assistant-long-lived-token");
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // Jellyfin as the children's user.
  const card = page.getByTestId("integration-jellyfin");
  await card.getByRole("button", { name: /Set up|Add another/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Server address").fill(`${MEDIA}/jellyfin`);
  await dialog.getByLabel("Username").fill("kids");
  await dialog.getByLabel("Password", { exact: true }).fill("secret");
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // The shelf, behind the connection's cog: no videos on offer.
  await card.getByRole("button", { name: /^Settings for / }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Kids' shelf" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Bibi & Tina Songs/ }).click();
  await dialog.getByRole("button", { name: /Sleepy songs/ }).click();
  await expect(dialog.getByRole("button", { name: /Movie night/ })).toHaveCount(0);
  await expect(dialog.getByTestId("shelf-item")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  // The speaker, at most half as loud, and talking on.
  await haCard.getByRole("button", { name: /^Settings for / }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Speakers & talking" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Kitchen speaker/ }).click();
  await dialog.getByRole("switch", { name: "Talk to Home Assistant" }).click();
  await expect(dialog.getByLabel("Voice assistant")).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  // Starting can need the PIN on a wall (D64); an admin isn't asked.
  await page.goto("/settings?section=dashboard");
  const guard = page.getByRole("radiogroup", { name: "Listening and the PIN" });
  await guard.getByRole("radio", { name: "Everything" }).click();
  await expect(guard.getByRole("radio", { name: "Everything" })).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Listening and the PIN" }).getByRole("radio", { name: "Everything" })).toHaveAttribute("aria-checked", "true");

  // Listening on this screen.
  await page.getByRole("link", { name: "Listen" }).first().click();
  await expect(page).toHaveURL(/\/media/);
  await expect(page.getByTestId("shelf-cover")).toHaveCount(2);
  await page.getByRole("button", { name: "Open Bibi & Tina Songs" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Needs the settings PIN")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Play Bibi & Tina Songs" }).click();
  await expect(dialog.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await (await request.get(`${MEDIA}/__requests`)).json()).map((r: { path: string }) => r.path).join(" ")).toContain("/Audio/t1/universal");
  await dialog.getByRole("button", { name: "Pause" }).click();

  // …and on the speaker: Home Assistant gets Kindo's signed addresses, queued.
  await dialog.getByRole("radio", { name: "Kitchen speaker" }).click();
  await dialog.getByRole("button", { name: "Play Bibi & Tina Songs on Kitchen speaker" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Playing: Bibi & Tina Songs", { timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // What plays here follows the family from page to page.
  await page.getByRole("button", { name: "Open Sleepy songs" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Play Sleepy songs" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await page.goto("/calendar");
  // A full page load ends the sound; the mini player shows only while something plays here.
  await expect(page.getByTestId("mini-player")).toHaveCount(0);

  // A child's own shelf, from their routine screen.
  await page.goto("/kids");
  await page.getByRole("link", { name: /Lena/ }).first().click();
  await page.getByRole("link", { name: "Listen" }).click();
  await expect(page).toHaveURL(/\/kids\/.+\/listen/);
  await expect(page.getByTestId("shelf-cover")).toHaveCount(2);

  // Talking: hold, speak (Chromium's fake microphone), let go.
  await page.goto("/home-control");
  const hold = page.getByRole("button", { name: "Hold to talk" });
  await hold.dispatchEvent("pointerdown");
  await expect(page.getByRole("button", { name: "Listening…" })).toBeVisible();
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: "Listening…" }).dispatchEvent("pointerup");
  const reply = page.getByTestId("voice-reply");
  await expect(reply).toContainText("Licht in der Küche an", { timeout: 15_000 });
  await expect(reply).toContainText("Licht ist an");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).last().click();

  // Leave nothing behind for the other tests.
  await page.goto("/settings?section=dashboard");
  await page.getByRole("radiogroup", { name: "Listening and the PIN" }).getByRole("radio", { name: "Free" }).click();
  await page.goto("/settings?section=integrations");
  await card.getByRole("button", { name: "Disconnect" }).click();
  await expect(card.getByRole("button", { name: "Disconnect" })).toHaveCount(0);
  await haCard.getByRole("button", { name: "Disconnect" }).click();
  await expect(haCard.getByRole("button", { name: "Disconnect" })).toHaveCount(0);
  assertNoErrors();
});

test("a locked wall asks for the PIN to start the shelf, and plays once it is in (D64)", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  // A fresh browser for the wall: the desktop project would hand it the admin's sign-in.
  const wall = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
  const { assertNoErrors } = await prepare(admin);
  await prepare(wall);
  admin.on("dialog", (d) => void d.accept());

  // Jellyfin with one album on the shelf, and everything guarded.
  await admin.goto("/settings?section=integrations");
  const card = admin.getByTestId("integration-jellyfin");
  await card.getByRole("button", { name: /Set up|Add another/ }).click();
  let dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Server address").fill(`${MEDIA}/jellyfin`);
  await dialog.getByLabel("Username").fill("kids");
  await dialog.getByLabel("Password", { exact: true }).fill("secret");
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await card.getByRole("button", { name: /^Settings for / }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Kids' shelf" }).click();
  dialog = admin.getByRole("dialog");
  await dialog.getByRole("button", { name: /Bibi & Tina Songs/ }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await admin.goto("/settings?section=dashboard");
  await admin.getByRole("radiogroup", { name: "Listening and the PIN" }).getByRole("radio", { name: "Everything" }).click();
  await expect(admin.getByText("Starting anything on the wall needs the PIN")).toBeVisible();

  // Pair the wall.
  await wall.goto("/pair");
  const code = (await wall.getByTestId("pairing-code").innerText()).replace(/\D/g, "");
  await admin.goto(`/settings?section=devices&code=${code}`);
  await admin.getByLabel("Name").fill(`Listening wall ${Date.now()}`);
  await admin.getByRole("button", { name: "Pair", exact: true }).click();
  await expect(wall).toHaveURL(/\/wall$/, { timeout: 15_000 });

  // The play button wears a lock; a tap asks for the PIN, then plays.
  await wall.goto("/media");
  await wall.getByRole("button", { name: "Open Bibi & Tina Songs" }).click();
  const player = wall.getByRole("dialog");
  await expect(player.getByLabel("Needs the settings PIN")).toBeVisible();
  await player.getByRole("button", { name: "Play Bibi & Tina Songs" }).click();
  const pin = wall.getByRole("dialog", { name: "Settings PIN" });
  await expect(pin).toBeVisible();
  for (const d of E2E_PIN) await pin.getByRole("button", { name: d, exact: true }).click();
  await pin.getByRole("button", { name: "Unlock" }).click();
  await expect(player.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 15_000 });
  // Pausing and playing on never ask.
  await player.getByRole("button", { name: "Pause" }).click();
  await player.getByRole("button", { name: "Play Bibi & Tina Songs" }).click();
  await expect(player.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(pin).toBeHidden();

  // Leave nothing behind.
  await admin.goto("/settings?section=dashboard");
  await admin.getByRole("radiogroup", { name: "Listening and the PIN" }).getByRole("radio", { name: "Free" }).click();
  await admin.goto("/settings?section=integrations");
  await card.getByRole("button", { name: "Disconnect" }).click();
  await expect(card.getByRole("button", { name: "Disconnect" })).toHaveCount(0);
  assertNoErrors();
});
