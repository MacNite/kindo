import { expect, test } from "@playwright/test";
import { prepare } from "./helpers";

/** Needs a CalDAV server with a calendar (Radicale in CI): CALDAV_TEST_URL, CALDAV_TEST_USER, CALDAV_TEST_PASSWORD. */
const URL_ = process.env.CALDAV_TEST_URL;

test.skip(!URL_, "no CalDAV server configured");

test("connect Nextcloud in Settings, then write an event to it (§19.5)", async ({ page }) => {
  await prepare(page);
  await page.goto("/settings?section=integrations");
  await page.getByRole("button", { name: "Set up" }).first().click();
  await page.getByLabel("Server address").fill(URL_!);
  await page.getByLabel("Username").fill(process.env.CALDAV_TEST_USER ?? "anna");
  await page.getByLabel("App password").fill(process.env.CALDAV_TEST_PASSWORD ?? "app-password");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(/synced/).first()).toBeVisible();

  // The calendar shows up in Settings → Calendar; give it to Lena.
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("listitem").getByRole("button", { name: /family.*Nextcloud/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Lena" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // Write an event into it from the calendar.
  await page.goto("/calendar");
  await page.getByRole("button", { name: "New event" }).click();
  await page.getByLabel("Title").fill("Swimming at Nextcloud");
  const select = page.getByRole("dialog").getByRole("combobox");
  const value = await select.locator("option").filter({ hasText: /family \(Nextcloud\)/ }).getAttribute("value");
  await select.selectOption(value!);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText("Swimming at Nextcloud").filter({ visible: true }).first()).toBeVisible();
});

test("change one occurrence of a Nextcloud series, and asked before deleting (D69)", async ({ page }) => {
  const { assertNoErrors } = await prepare(page);
  // A daily series made in another app, in the calendar connected above.
  const auth = { Authorization: `Basic ${Buffer.from(`${process.env.CALDAV_TEST_USER ?? "anna"}:${process.env.CALDAV_TEST_PASSWORD ?? "app-password"}`).toString("base64")}` };
  const object = new URL(`${process.env.CALDAV_TEST_USER ?? "anna"}/family/piano.ics`, URL_).toString();
  const d = new Date(Date.now() + 86_400_000);
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const put = await fetch(object, {
    method: "PUT", headers: { ...auth, "Content-Type": "text/calendar" },
    body: ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", "BEGIN:VEVENT", "UID:piano@elsewhere", `DTSTAMP:${ymd}T000000Z`,
      `DTSTART:${ymd}T140000Z`, `DTEND:${ymd}T150000Z`, "RRULE:FREQ=DAILY;COUNT=5", "SUMMARY:Piano lesson", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n"),
  });
  expect(put.ok).toBe(true);
  try {
    await page.goto("/settings?section=integrations");
    await page.getByRole("button", { name: "Sync now" }).first().click();
    await page.goto("/calendar");
    await page.getByRole("radio", { name: "Agenda" }).click();
    const pianos = page.getByRole("button", { name: /Piano lesson/ });
    await expect(pianos).toHaveCount(5);

    // One occurrence: the editor asks how much of the series is meant, "This event" first.
    await pianos.first().click();
    await expect(page.getByRole("dialog").getByText("Repeats")).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    const scope = page.getByRole("radiogroup", { name: "Change" });
    await expect(scope.getByRole("radio")).toHaveText(["This event", "This and following", "All events"]);
    await expect(scope.getByRole("radio", { name: "This event" })).toHaveAttribute("aria-checked", "true");
    await page.getByLabel("Title").fill("Piano with Oma");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Piano with Oma/ })).toHaveCount(1);
    await expect(pianos).toHaveCount(4);

    // Several events keep their day; deleting says what goes and waits for a yes.
    await pianos.first().click();
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("radio", { name: "All events" }).click();
    await expect(page.getByLabel("When")).toBeDisabled();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(/Delete the whole series\?/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await page.getByRole("radio", { name: "This event" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Delete only this event? The rest of the series stays.")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
    await expect(pianos).toHaveCount(3);
    await expect(page.getByRole("button", { name: /Piano with Oma/ })).toHaveCount(1);
    assertNoErrors();
  } finally {
    await fetch(object, { method: "DELETE", headers: auth });
  }
});
