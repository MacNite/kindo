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

/** Today at hh:mm on the household's clock; the demo seed takes its time zone from TZ. */
function householdTime(h: number, m: number): Date {
  const timeZone = process.env.TZ || "Europe/Berlin";
  const now = new Date();
  const guess = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(guess).map((x) => [x.type, Number(x.value)]));
  const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return new Date(guess - (shown - guess));
}

test("the night rest lets the wall's screen go dark and holds it again in the morning (§13, D59)", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { wakeLocks: number; released: number };
    w.wakeLocks = 0;
    w.released = 0;
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: async () => {
          w.wakeLocks++;
          const lock = { released: false, release: async () => { lock.released = true; w.released++; }, addEventListener() {} };
          return lock;
        },
      },
    });
  });
  const locks = () => page.evaluate(() => { const w = window as unknown as { wakeLocks: number; released: number }; return { held: w.wakeLocks, released: w.released }; });
  await page.clock.install({ time: householdTime(21, 50) });
  await prepare(page);

  await page.goto("/photos");
  const rest = page.getByRole("switch", { name: "Night rest" });
  await rest.click();
  await expect(rest).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("From")).toHaveValue("22:00");
  await expect(page.getByLabel("Until")).toHaveValue("06:00");
  try {
    await page.goto("/wall");
    await expect.poll(locks).toEqual({ held: 1, released: 0 });

    // 22:05: the lock is let go, and once idle the frame is black, without photos or clock.
    await page.clock.fastForward("15:00");
    await expect.poll(locks).toEqual({ held: 1, released: 1 });
    await expect(page.locator("[data-night]")).toBeVisible();

    // A touch shows the wall; it does not hold the screen on.
    await page.locator("[data-night]").click();
    await expect(page.locator("[data-night]")).toHaveCount(0);
    await expect.poll(locks).toEqual({ held: 1, released: 1 });

    // 06:05: the wall holds the screen on again and the photo frame is back.
    await page.clock.fastForward("08:00:00");
    await expect.poll(locks).toEqual({ held: 2, released: 1 });
    await expect(page.locator("[data-night]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tap to return" })).toBeVisible();
  } finally {
    await page.goto("/photos");
    await page.getByRole("switch", { name: "Night rest" }).click();
    await expect(page.getByRole("switch", { name: "Night rest" })).toHaveAttribute("aria-checked", "false");
  }
});
