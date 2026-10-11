import { expect, test, type Page, type Route } from "@playwright/test";
import { prepare } from "./helpers";

/** The delete Server Action: its only argument is `{ id }`. */
const isDelete = (r: Route) => r.request().method() === "POST" && /^\[\{"id":"[^"]+"\}\]$/.test(r.request().postData() ?? "");

/** Adds an event to Kindo's own calendar today and opens it in the editor. */
async function editNewEvent(page: Page, title: string) {
  await page.goto("/calendar");
  await page.getByRole("button", { name: "New event" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await openEditor(page, title);
}

async function openEditor(page: Page, title: string) {
  await page.getByRole("radio", { name: "Agenda" }).click();
  await page.getByText(title).filter({ visible: true }).first().click();
  await page.getByRole("dialog", { name: title }).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog", { name: "Edit event" })).toBeVisible();
}

const confirmDialog = (page: Page) => page.getByRole("alertdialog", { name: "Delete this event?" });
const deleteButton = (page: Page) => page.getByRole("dialog", { name: "Edit event" }).getByRole("button", { name: "Delete" });

async function expectStillThere(page: Page, title: string) {
  await page.reload();
  await page.getByRole("radio", { name: "Agenda" }).click();
  await expect(page.getByText(title).filter({ visible: true }).first()).toBeVisible();
}

test("Delete asks first, naming the event and its calendar, without focusing the destructive button", async ({ page }) => {
  const { assertNoErrors } = await prepare(page);
  const title = `Dentist ${Date.now()}`;
  await editNewEvent(page, title);
  await deleteButton(page).click();
  const confirm = confirmDialog(page);
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(title);
  await expect(confirm).toContainText(/Only this event is deleted, from .+\(/);
  await expect(confirm).toContainText("This can't be undone.");
  const destroy = confirm.getByRole("button", { name: "Delete event" });
  await expect(destroy).not.toBeFocused();
  // Enter on the panel does nothing.
  await page.keyboard.press("Enter");
  await expect(confirm).toBeVisible();

  // Cancel closes only the question; the editor is still there.
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Edit event" })).toBeVisible();
  await expect(deleteButton(page)).toBeFocused();
  await expectStillThere(page, title);
  assertNoErrors();
});

test("Escape and the backdrop dismiss the question and change nothing", async ({ page }) => {
  await prepare(page);
  const title = `Piano ${Date.now()}`;
  await editNewEvent(page, title);
  let deletes = 0;
  await page.route("**/*", (r) => { if (isDelete(r)) deletes++; return r.fallback(); });

  await deleteButton(page).click();
  await expect(confirmDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirmDialog(page)).toBeHidden();
  // Only the topmost dialog answered Escape.
  await expect(page.getByRole("dialog", { name: "Edit event" })).toBeVisible();

  await deleteButton(page).click();
  await expect(confirmDialog(page)).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(confirmDialog(page)).toBeHidden();

  expect(deletes).toBe(0);
  await expectStillThere(page, title);
});

test("an accidental double tap on Delete doesn't delete", async ({ page }) => {
  await prepare(page);
  const title = `Football ${Date.now()}`;
  await editNewEvent(page, title);
  let deletes = 0;
  await page.route("**/*", (r) => { if (isDelete(r)) deletes++; return r.fallback(); });
  // The second tap lands on the question (its backdrop or Cancel), never on its Delete.
  await deleteButton(page).dblclick();
  await expect(page.getByRole("dialog", { name: "Edit event" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(deletes).toBe(0);
  await expectStillThere(page, title);
});

test("a failed delete says so and keeps the event; trying again deletes it once", async ({ page }) => {
  await prepare(page);
  const title = `Swimming ${Date.now()}`;
  await editNewEvent(page, title);

  // The server can't be reached.
  await page.route("**/*", (r) => (isDelete(r) ? r.abort() : r.fallback()));
  await deleteButton(page).click();
  const confirm = confirmDialog(page);
  await confirm.getByRole("button", { name: "Delete event" }).click();
  await expect(confirm.getByRole("alert")).toHaveText("No connection. Please try again.");
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Delete event" })).toBeEnabled();
  await page.unroute("**/*");

  // A slow answer: tapping twice still sends one delete, and the dialog waits for it.
  let deletes = 0;
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/*", async (r) => {
    if (!isDelete(r)) return r.fallback();
    deletes++;
    await held;
    return r.fallback();
  });
  await confirm.getByRole("button", { name: "Delete event" }).dblclick();
  await expect(confirm.getByRole("button", { name: "Delete event" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(confirm).toBeVisible();
  release();

  await expect(confirm).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Edit event" })).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: `“${title}” deleted.` })).toBeVisible();
  expect(deletes).toBe(1);
  await page.reload();
  await page.getByRole("radio", { name: "Agenda" }).click();
  await expect(page.getByText(title)).toHaveCount(0);
});
