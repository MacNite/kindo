import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";

const IMMICH = `http://127.0.0.1:${process.env.IMMICH_MOCK_PORT ?? 3198}`;

test("connect Immich, put an album in the rotation, and get its photos through Kindo (§19.6)", async ({ page }) => {
  await prepare(page);
  await page.goto("/settings?section=integrations");
  const card = page.getByTestId("integration-immich");
  await card.getByRole("button", { name: "Set up" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Grandparents");
  await dialog.getByLabel("Server address").fill(IMMICH);
  await dialog.getByLabel("API key").fill("e2e-immich-api-key");
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  await page.goto("/photos");
  await expect(page.getByText("Immich, Grandparents")).toBeVisible();
  // Take the demo's albums out of the rotation, so only the new one is drawn from.
  const selected = page.getByRole("button", { pressed: true }).filter({ hasText: /photos/ });
  while ((await selected.count()) > 0) {
    const before = await selected.count();
    await selected.first().click();
    await expect(selected).toHaveCount(before - 1);
  }
  const summer = page.getByRole("button", { name: /Summer/ });
  await expect(summer).toHaveAttribute("aria-pressed", "false");
  await summer.click();
  await expect(summer).toHaveAttribute("aria-pressed", "true");

  // The preview strip now shows proxied photos; the image comes from Kindo, never from Immich directly.
  const img = page.locator("img[src^='/api/photos/']").first();
  await expect(img).toBeAttached({ timeout: 15_000 });
  const src = await img.getAttribute("src");
  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/jpeg");
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("photos are not served to anyone signed out", async ({ request }) => {
    expect((await request.get("/api/photos/anything?size=preview")).status()).toBe(401);
  });
});
