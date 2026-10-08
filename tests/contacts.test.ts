import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import * as C from "@/server/connections";
import { addressBooksOf, dueContactConnections, setContactBooks, syncContacts, updateContactBirthday } from "@/server/contacts/sync";
import { loadSnapshot } from "@/server/snapshot";
import { seedDemo } from "@/server/demo/seed";
import { encryptSecret } from "@/server/crypto";
import { TEST_DB, VIEWER, resetTestDatabase } from "./db";

/**
 * Contact birthdays (§12, D46) against a real CardDAV server: Radicale in CI,
 * with the same account as the CalDAV tests. Nextcloud works the same.
 */
const URL_ = process.env.CALDAV_TEST_URL;
const USER = process.env.CALDAV_TEST_USER ?? "anna";
const PASS = process.env.CALDAV_TEST_PASSWORD ?? "app-password";
const auth = { Authorization: `Basic ${Buffer.from(`${USER}:${PASS}`).toString("base64")}` };
const BOOK = `kindo-test-${Date.now()}`;
const bookUrl = () => new URL(`${USER}/${BOOK}/`, URL_).toString();

const vcard = (uid: string, fn: string, bday?: string) =>
  ["BEGIN:VCARD", "VERSION:3.0", `UID:${uid}`, `FN:${fn}`, ...(bday ? [`BDAY:${bday}`] : []), "END:VCARD", ""].join("\r\n");
const put = (name: string, body: string) => fetch(`${bookUrl()}${name}.vcf`, { method: "PUT", headers: { ...auth, "Content-Type": "text/vcard" }, body });

describe.skipIf(!TEST_DB || !URL_)("Contact birthdays from CardDAV (D46)", () => {
  let db: PrismaClient;
  let connectionId = "";

  beforeAll(async () => {
    db = await resetTestDatabase();
    await db.$transaction((tx) => seedDemo(tx), { timeout: 60_000 });
    const made = await fetch(bookUrl(), {
      method: "MKCOL",
      headers: { ...auth, "Content-Type": "application/xml" },
      body: `<?xml version="1.0"?><mkcol xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><set><prop><resourcetype><collection/><C:addressbook/></resourcetype><displayname>Family</displayname></prop></set></mkcol>`,
    });
    expect(made.status).toBe(201);
    expect((await put("mama", vcard("mama", "Mama Nitschke", "19511013"))).ok).toBe(true);
    expect((await put("carla", vcard("carla", "Carla Rossi", "--0704"))).ok).toBe(true);
    expect((await put("nobday", vcard("nobday", "No Birthday"))).ok).toBe(true);
    connectionId = await C.addCalDav(db, { url: URL_!, username: USER, password: PASS });
  }, 60_000);
  afterAll(async () => {
    await fetch(bookUrl(), { method: "DELETE", headers: auth }).catch(() => {});
    await db?.$disconnect();
  });

  it("lists the account's address books with the calendar's app password", async () => {
    const books = await addressBooksOf(db, { id: connectionId });
    expect(books).toContainEqual({ url: expect.stringContaining(`/${BOOK}/`), name: "Family" });
  });

  it("reads the birthdays, hidden until someone picks them", async () => {
    const url = (await addressBooksOf(db, { id: connectionId })).find((b) => b.url.includes(BOOK))!.url;
    await setContactBooks(db, { id: connectionId, books: [url], autoShow: false });
    const rows = await db.contactBirthday.findMany({ where: { connectionId }, orderBy: { name: "asc" } });
    expect(rows.map((r) => [r.name, r.date, r.show])).toEqual([["Carla Rossi", "--07-04", false], ["Mama Nitschke", "1951-10-13", false]]);
    // Just read: not due again for an hour.
    expect((await dueContactConnections(db)).map((c) => c.id)).not.toContain(connectionId);
    expect((await dueContactConnections(db, new Date(Date.now() + 61 * 60_000))).map((c) => c.id)).toContain(connectionId);
  });

  it("keeps the household's name, choice and colour when the contact changes, and drops removed contacts", async () => {
    const mama = await db.contactBirthday.findFirstOrThrow({ where: { connectionId, uid: "mama" } });
    await updateContactBirthday(db, { id: mama.id, show: true, alias: "Oma Biggy", memberId: "max" });
    await put("mama", vcard("mama", "Brigitte Nitschke", "1951-10-14"));
    await fetch(`${bookUrl()}carla.vcf`, { method: "DELETE", headers: auth });
    await syncContacts(db, await db.connection.findUniqueOrThrow({ where: { id: connectionId } }));
    const rows = await db.contactBirthday.findMany({ where: { connectionId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: mama.id, name: "Brigitte Nitschke", date: "1951-10-14", show: true, alias: "Oma Biggy", memberId: "max" });
    // An empty alias goes back to the address-book name.
    await updateContactBirthday(db, { id: mama.id, alias: "" });
    expect((await db.contactBirthday.findUniqueOrThrow({ where: { id: mama.id } })).alias).toBeNull();
  });

  it("sends the wall only the contacts the household picked", async () => {
    const admin = await loadSnapshot(db, VIEWER);
    const wall = await loadSnapshot(db, { kind: "device", name: "Kitchen", canManage: false, isAdmin: false, pinSet: false });
    expect(admin!.birthdays.length).toBeGreaterThan(wall!.birthdays.length);
    expect(wall!.birthdays.every((b) => b.show)).toBe(true);
    expect(wall!.birthdays.map((b) => b.name)).toContain("Brigitte Nitschke");
    expect(wall!.birthdays.map((b) => b.name)).not.toContain("Peter Vogt (Büro)");
  });

  it("forgets the contacts when no address book is chosen any more", async () => {
    await setContactBooks(db, { id: connectionId, books: [], autoShow: false });
    expect(await db.contactBirthday.count({ where: { connectionId } })).toBe(0);
  });
});

describe.skipIf(!TEST_DB)("contacts from a server that is down", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = await resetTestDatabase();
  }, 60_000);
  afterAll(() => db?.$disconnect());

  it("backs off instead of asking every minute, and is due again once it worked", async () => {
    const books = ["http://127.0.0.1:9/addressbooks/anna/family/"]; // nothing listens there
    const conn = await db.connection.create({
      data: { kind: "caldav", name: "Nextcloud", url: "http://127.0.0.1:9/", username: "anna", secret: encryptSecret("pw"), config: { contacts: { books, autoShow: false } } },
    });
    const now = new Date("2026-10-08T10:00:00Z");
    const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
    const due = async (when: Date) => (await dueContactConnections(db, when)).some((c) => c.id === conn.id);
    expect(await due(now)).toBe(true);
    await expect(syncContacts(db, conn, now)).rejects.toThrow();
    expect(await due(at(1))).toBe(false);
    expect(await due(at(2))).toBe(true);
    await expect(syncContacts(db, await db.connection.findUniqueOrThrow({ where: { id: conn.id } }), at(2))).rejects.toThrow();
    expect(await due(at(5))).toBe(false);
    expect(await due(at(6))).toBe(true);
    // Never longer than the hourly read.
    const cfg = { contacts: { books, autoShow: false, failedAt: now.toISOString(), failures: 30 } };
    await db.connection.update({ where: { id: conn.id }, data: { config: cfg } });
    expect(await due(at(59))).toBe(false);
    expect(await due(at(60))).toBe(true);
  });
});
