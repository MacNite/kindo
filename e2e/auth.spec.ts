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

  // Unpairing ends it.
  await admin.reload();
  const row = admin.getByRole("listitem").filter({ hasText: name });
  await row.getByRole("button", { name: "Unpair" }).click();
  await expect(row).toHaveCount(0);
  await wall.goto("/wall");
  await expect(wall).toHaveURL(/\/login/);
});
