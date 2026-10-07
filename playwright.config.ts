import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Prisma reads .env on its own; the suite needs DATABASE_URL to derive its own database.
try {
  process.loadEnvFile?.(".env");
} catch {}

/**
 * The suite's own database: `<name>_e2e` next to DATABASE_URL, unless
 * E2E_DATABASE_URL names one. A developer's data is never touched.
 */
function e2eDatabaseUrl(base = process.env.DATABASE_URL): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  if (!base) throw new Error("Set DATABASE_URL (or E2E_DATABASE_URL) to run the end-to-end suite.");
  const u = new URL(base);
  const name = u.pathname.replace(/^\//, "") || "kindo";
  u.pathname = `/${name.endsWith("_e2e") ? name : `${name}_e2e`}`;
  return u.toString();
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/** Prefer a Chromium the environment already provides (as in BrewCore). */
function providedChromium(): string | undefined {
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_PATH].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p));
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-GB",
    launchOptions: { executablePath: providedChromium() },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        // A fresh demo household in the suite's own database (e2e/prepare-db.ts), then the production server.
        command: "npx tsx e2e/prepare-db.ts && npm run start",
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: { PORT: String(PORT), HOSTNAME: "127.0.0.1", DATABASE_URL: e2eDatabaseUrl() },
      },
});
