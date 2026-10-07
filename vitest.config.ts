import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Run date logic in a DST-observing zone so daylight-saving bugs show up in CI.
process.env.TZ = "Europe/Berlin";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Playwright specs run through `npm run test:e2e`, not Vitest.
    exclude: ["**/node_modules/**", "e2e/**"],
    // The integration tests share one PostgreSQL database (TEST_DATABASE_URL).
    fileParallelism: false,
  },
});
