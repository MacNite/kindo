import { expect, test, type Page } from "@playwright/test";
import { prepare } from "./helpers";
import { ADMIN, ADMIN_STATE, ADULT, E2E_PIN } from "./logins";

const OIDC = `http://127.0.0.1:${process.env.OIDC_MOCK_PORT ?? 3199}`;

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("signed out, every page leads to the sign-in page and back (§19.4)", async ({ page }) => {
  await prepare(page);
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/login\?next=%2Fcalendar$/);
  await signIn(page, { ...ADMIN, password: "wrong password" });
  await expect(page.getByText("Email or password isn't right.")).toBeVisible();
  await signIn(page, ADMIN);
  await expect(page).toHaveURL(/\/calendar$/);
});

test("the household's API refuses requests without a login", async ({ request }) => {
  expect((await request.get("/api/stream")).status()).toBe(401);
  expect((await request.get("/api/health")).ok()).toBe(true);
  // A speaker can't sign in; its signed address is checked by the route itself (D61), so a wrong one is refused there.
  expect((await request.get("/api/media/cast/abcdef12-0.9999999999999.not-a-valid_signature")).status()).toBe(403);
});

test("single sign-on signs in a person who has a login", async ({ page, request }) => {
  await request.post(`${OIDC}/__identity`, { data: { sub: "authentik-anna", email: ADMIN.email, name: "Anna" } });
  await prepare(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with authentik" }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.getByRole("heading", { name: "Anna", exact: true })).toBeVisible();
});

test("single sign-on does not create logins for strangers", async ({ page, request }) => {
  await request.post(`${OIDC}/__identity`, { data: { sub: "stranger", email: "stranger@example.test", name: "Stranger" } });
  await prepare(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with authentik" }).click();
  await expect(page).toHaveURL(/\/login\?error=/);
  await expect(page.locator("span[role=alert]")).toBeVisible();
});

test("an adult doesn't see the admin's settings", async ({ page }) => {
  await prepare(page);
  await page.goto("/login");
  await signIn(page, ADULT);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Your account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Devices" })).toHaveCount(0);
});

test("signing out leaves no household data on the device (§19.7)", async ({ page }) => {
  await prepare(page);
  await page.goto("/login");
  await signIn(page, ADULT);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await page.goto("/shopping");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const kept = () => page.evaluate(async () => {
    // The sign-in page may be cached again on the way out; the household's pages must not.
    let shopping = false;
    for (const name of (await caches.keys()).filter((n) => !n.startsWith("serwist-precache"))) {
      if ((await (await caches.open(name)).keys()).some((r) => new URL(r.url).pathname === "/shopping")) shopping = true;
    }
    const snapshot = await new Promise<boolean>((resolve) => {
      const req = indexedDB.open("kindo");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) return resolve(false), db.close();
        const get = db.transaction("kv").objectStore("kv").get("snapshot");
        get.onsuccess = () => (resolve(get.result !== undefined), db.close());
      };
      req.onerror = () => resolve(false);
    });
    return { shopping, snapshot };
  });
  await expect.poll(kept).toEqual({ shopping: true, snapshot: true });

  await page.goto("/settings?section=account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await kept()).toEqual({ shopping: false, snapshot: false });
});

test("a wall display is paired with a code, ticks routines, and needs the PIN for settings", async ({ browser }) => {
  const wall = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  await prepare(wall);
  await prepare(admin);

  await wall.goto("/pair");
  const code = (await wall.getByTestId("pairing-code").innerText()).replace(/\D/g, "");
  expect(code).toMatch(/^\d{6}$/);

  // The QR code opens Settings → Devices with the code filled in.
  await admin.goto(`/settings?section=devices&code=${code}`);
  const name = `Hallway ${Date.now()}`;
  await admin.getByLabel("Name").fill(name);
  await admin.getByRole("button", { name: "Pair", exact: true }).click();
  await expect(admin.getByRole("status")).toBeVisible();

  await expect(wall).toHaveURL(/\/wall$/, { timeout: 15_000 });

  // Ticking off is what a wall is for: no PIN.
  await wall.goto("/kids/paul");
  await wall.getByRole("radio", { name: "Evening" }).click();
  const story = wall.getByRole("button", { name: "Story", exact: true });
  const before = await story.getAttribute("aria-pressed");
  await story.click();
  await expect(story).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");

  // Settings are locked until someone enters the PIN.
  await wall.goto("/settings");
  await expect(wall.getByText("Settings on a wall display are protected by the PIN.")).toBeVisible();
  await wall.getByRole("button", { name: "Unlock" }).click();
  for (const d of E2E_PIN) await wall.getByRole("button", { name: d, exact: true }).click();
  await wall.getByRole("dialog").getByRole("button", { name: "Unlock" }).click();
  await expect(wall.getByRole("button", { name: "Family", exact: true })).toBeVisible();
  await expect(wall.getByRole("button", { name: "Lock" })).toBeVisible();
  // The PIN gives "manage", never admin (§20 D27): no devices or integrations.
  await expect(wall.getByRole("button", { name: "Devices", exact: true })).toHaveCount(0);
  await expect(wall.getByRole("button", { name: "Integrations", exact: true })).toHaveCount(0);

  // A typo at pairing is fixed by renaming; the display stays paired.
  await admin.reload();
  await admin.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Rename" }).click();
  const renamed = `Kitchen ${Date.now()}`;
  const field = admin.getByLabel(`New name for ${name}`);
  await field.fill(renamed);
  await admin.getByRole("listitem").filter({ has: field }).getByRole("button", { name: "Save" }).click();
  const row = admin.getByRole("listitem").filter({ hasText: renamed });
  await expect(row).toBeVisible();
  await wall.goto("/wall");
  await expect(wall).toHaveURL(/\/wall$/);

  // Unpairing ends it.
  await row.getByRole("button", { name: "Unpair" }).click();
  await expect(row).toHaveCount(0);
  await wall.goto("/wall");
  await expect(wall).toHaveURL(/\/login/);
});

test("an adult added with an email signs in through single sign-on (§20 D58)", async ({ browser, request }) => {
  const admin = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  await prepare(admin);
  await admin.goto("/settings?section=members");
  await admin.getByRole("button", { name: "Add person" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Oma");
  await dialog.getByRole("radio", { name: "Adult" }).click();
  await dialog.getByLabel("Email for signing in").fill("oma@example.test");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(admin.getByText("oma@example.test")).toBeVisible();

  await request.post(`${OIDC}/__identity`, { data: { sub: "authentik-oma", email: "oma@example.test", name: "Oma" } });
  const oma = await (await browser.newContext()).newPage();
  await prepare(oma);
  await oma.goto("/login");
  await oma.getByRole("button", { name: "Sign in with authentik" }).click();
  await expect(oma).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(oma.getByRole("heading", { name: "Oma", exact: true })).toBeVisible();

  // Leave the family as the other tests expect it.
  await admin.getByRole("button", { name: "Edit: Oma" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(admin.getByText("oma@example.test")).toHaveCount(0);
});
