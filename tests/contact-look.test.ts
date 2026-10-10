import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { contactPhoto, decodePhoto, setContactPhoto, updateContactBirthday } from "@/server/contacts/sync";
import { loadSnapshot } from "@/server/snapshot";
import { seedDemo } from "@/server/demo/seed";
import { TEST_DB, VIEWER, resetTestDatabase } from "./db";

/** The smallest PNG there is: one transparent pixel. */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const WALL = { kind: "device", name: "Kitchen", canManage: false, isAdmin: false, pinSet: false } as const;

describe("contact pictures (D61)", () => {
  it("takes JPEG, PNG and WebP that are what they say, and nothing else", () => {
    expect(decodePhoto(`data:image/png;base64,${PNG}`)).toMatchObject({ type: "image/png" });
    expect(decodePhoto(`data:image/jpeg;base64,${PNG}`)).toBeNull();
    expect(decodePhoto(`data:image/svg+xml;base64,${btoa("<svg onload='alert(1)'/>")}`)).toBeNull();
    expect(decodePhoto("https://example.com/x.png")).toBeNull();
  });
});

describe.skipIf(!TEST_DB)("a contact's colour and photo (D61)", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = await resetTestDatabase();
    await seedDemo(db);
  }, 60_000);
  afterAll(() => db?.$disconnect());

  it("keeps a colour and a photo, sends the photo's address and serves it to screens that may see the contact", async () => {
    const [shown, hidden] = await Promise.all([db.contactBirthday.findFirstOrThrow({ where: { show: true } }), db.contactBirthday.findFirstOrThrow({ where: { show: false } })]);
    await updateContactBirthday(db, { id: shown.id, color: "#2E8B6E" });
    await setContactPhoto(db, { id: shown.id, photo: `data:image/png;base64,${PNG}` });
    await setContactPhoto(db, { id: hidden.id, photo: `data:image/png;base64,${PNG}` });

    const wall = await loadSnapshot(db, WALL);
    expect(wall!.birthdays.find((b) => b.id === shown.id)).toMatchObject({ color: "#2E8B6E", photo: expect.stringMatching(new RegExp(`^/api/contacts/${shown.id}/photo\\?v=\\d+$`)) });
    expect(JSON.stringify(wall)).not.toContain(PNG.slice(0, 20));

    expect((await contactPhoto(db, shown.id, false)).body.equals(Buffer.from(PNG, "base64"))).toBe(true);
    await expect(contactPhoto(db, hidden.id, false)).rejects.toMatchObject({ code: "notFound" });
    expect((await contactPhoto(db, hidden.id, true)).type).toBe("image/png");

    await expect(setContactPhoto(db, { id: shown.id, photo: "data:image/png;base64,AAAA" })).rejects.toMatchObject({ code: "photo" });
    await setContactPhoto(db, { id: shown.id, photo: null });
    await updateContactBirthday(db, { id: shown.id, color: null });
    const admin = await loadSnapshot(db, VIEWER);
    const back = admin!.birthdays.find((b) => b.id === shown.id)!;
    expect([back.color, back.photo]).toEqual([undefined, undefined]);
  });

  it("answers a screen without a session with 401 and a missing picture with 404", async () => {
    vi.resetModules();
    vi.doMock("@/server/db", () => ({ prisma: db }));
    vi.doMock("@/server/actor", async (orig) => ({ ...(await orig<object>()), getActor: async () => null }));
    const { GET } = await import("@/app/api/contacts/[contactId]/photo/route");
    expect((await GET(new Request("http://kindo.test/"), { params: Promise.resolve({ contactId: "x" }) })).status).toBe(401);
    vi.doMock("@/server/actor", async (orig) => ({ ...(await orig<object>()), getActor: async () => ({ kind: "device", deviceId: "d", name: "Kitchen", elevated: false }) }));
    vi.resetModules();
    const route = await import("@/app/api/contacts/[contactId]/photo/route");
    expect((await route.GET(new Request("http://kindo.test/"), { params: Promise.resolve({ contactId: "nope" }) })).status).toBe(404);
  });
});
