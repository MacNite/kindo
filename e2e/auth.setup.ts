import { expect, test as setup } from "@playwright/test";
import { ADMIN, ADMIN_STATE } from "./logins";

setup("sign in as the demo admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: ADMIN_STATE });
});
