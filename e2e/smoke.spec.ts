import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";

const ROUTES = ["/", "/calendar", "/routines", "/tasks", "/shopping", "/meals", "/rewards", "/photos", "/settings", "/wall", "/kids", "/kids/lena", "/kids/paul"];

test("health endpoint answers", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: "ok", service: "kindo" });
});

for (const route of ROUTES) {
  test(`${route} renders without errors`, async ({ page }) => {
    const { assertNoErrors } = await prepare(page);
    await page.goto(route);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.locator("a, button").first()).toBeVisible();
    assertNoErrors();
  });
}
