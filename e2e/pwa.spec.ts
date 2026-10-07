import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";

test("Kindo is installable: manifest, icons, service worker (§19.7)", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Kindo", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200);

  await prepare(page);
  await page.goto("/");
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);
});

test("the shopping list works without a connection and catches up afterwards (§10)", async ({ page, context }) => {
  await prepare(page);
  await page.goto("/shopping");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Open it once more so the service worker has this page in its cache.
  await page.reload();
  await expect(page.getByPlaceholder("Add to Groceries")).toBeVisible();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  await context.setOffline(true);
  await page.getByPlaceholder("Add to Groceries").fill("Offline oat milk");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Offline oat milk")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "1 changes" })).toBeVisible();

  // A reload in the shop still shows the list, with the change.
  await page.reload();
  await expect(page.getByText("Offline oat milk")).toBeVisible();

  // Back online: the change goes to the server.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status").filter({ hasText: "changes will be sent" })).toHaveCount(0, { timeout: 15_000 });
  const other = await context.browser()!.newContext({ storageState: await context.storageState() });
  const p2 = await other.newPage();
  await prepare(p2);
  await p2.goto("/shopping");
  await expect(p2.getByText("Offline oat milk")).toBeVisible();
  await other.close();
});

test("the wall display keeps the screen on (§2)", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { wakeLocks: number };
    w.wakeLocks = 0;
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: async () => { w.wakeLocks++; return { released: false, release: async () => {}, addEventListener() {} }; } },
    });
  });
  await prepare(page);
  await page.goto("/wall");
  await expect.poll(() => page.evaluate(() => (window as unknown as { wakeLocks: number }).wakeLocks)).toBeGreaterThan(0);
});
