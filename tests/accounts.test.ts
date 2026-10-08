import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { verifyPassword } from "better-auth/crypto";
import * as Acc from "@/server/accounts";
import { deleteMember, saveMember } from "@/server/household";
import { setupHousehold, setupState } from "@/server/setup";
import { seedDemo } from "@/server/demo/seed";
import { can, deviceFromToken, type Actor } from "@/server/actor";
import { sign, verify } from "@/server/crypto";
import { TEST_DB, resetTestDatabase } from "./db";

describe("who may do what (§19.4)", () => {
  const user = (role: "admin" | "adult" | "child"): Actor => ({ kind: "user", userId: "u", memberId: "m", role, name: "x" });
  const device = (elevated: boolean): Actor => ({ kind: "device", deviceId: "d", name: "Kitchen", elevated });
  it.each([
    ["admin", user("admin"), [true, true, true, true]],
    ["adult", user("adult"), [true, true, true, false]],
    ["wall display", device(false), [true, true, false, false]],
    ["wall display unlocked with the PIN", device(true), [true, true, true, false]],
    ["nobody", null, [false, false, false, false]],
  ] as const)("%s", (_name, actor, expected) => {
    expect((["view", "tick", "manage", "admin"] as const).map((l) => can(actor, l))).toEqual(expected);
  });

  it("signed values can't be forged or kept past their expiry", () => {
    const s = sign("device-1", 60_000, 1_000);
    expect(verify(s, 2_000)).toBe("device-1");
    expect(verify(s, 70_000)).toBeNull();
    expect(verify(s.replace("device-1", "device-2"), 2_000)).toBeNull();
    expect(verify(undefined)).toBeNull();
  });
});

describe.skipIf(!TEST_DB)("logins, devices and the PIN (§19.4)", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = await resetTestDatabase();
    await db.$transaction((tx) => seedDemo(tx), { timeout: 60_000 });
  }, 60_000);
  afterAll(() => db?.$disconnect());

  it("a demo household from before accounts is claimed by its first admin", async () => {
    expect(await setupState(db)).toBe("claim");
    await setupHousehold(db, {
      demo: false, household: "x", timezone: "Europe/Berlin", member: { name: "x", color: "#3B78C2", avatar: { kind: "initial" } },
      email: "Anna@Example.test", password: "a long enough password",
    });
    const anna = await db.member.findUniqueOrThrow({ where: { id: "anna" }, include: { user: { include: { accounts: true } } } });
    expect(anna.user?.email).toBe("anna@example.test");
    expect(await verifyPassword({ hash: anna.user!.accounts[0].password!, password: "a long enough password" })).toBe(true);
    expect(await setupState(db)).toBe("done");
  });

  it("an admin who can sign in always remains, even next to an admin without a login", async () => {
    const oma = await saveMember(db, { name: "Oma", role: "admin", color: "#2E8B6E", avatar: { kind: "initial" } });
    const anna = { id: "anna", name: "Anna", color: "#3B78C2", avatar: { kind: "initial" as const } };
    await expect(deleteMember(db, { id: "anna" })).rejects.toMatchObject({ code: "invalid" });
    await expect(saveMember(db, { ...anna, role: "adult" })).rejects.toMatchObject({ code: "invalid" });
    await expect(Acc.removeLogin(db, { memberId: "anna" })).rejects.toMatchObject({ code: "invalid" });
    expect(await setupState(db)).toBe("done");
    // An admin without a login may go, or stop being an admin.
    await saveMember(db, { id: oma, name: "Oma", role: "adult", color: "#2E8B6E", avatar: { kind: "initial" } });
    await deleteMember(db, { id: oma });
  });

  it("adults get logins, children never do, and an email is used once", async () => {
    await expect(Acc.createLogin(db, { memberId: "lena", email: "lena@example.test", password: "password123" })).rejects.toMatchObject({ code: "invalid" });
    await Acc.createLogin(db, { memberId: "max", email: "max@example.test" }); // single sign-on only
    expect(await db.account.count({ where: { user: { email: "max@example.test" } } })).toBe(0);
    await expect(Acc.createLogin(db, { memberId: "max", email: "other@example.test" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("resetting a password signs the person out everywhere", async () => {
    const max = await db.member.findUniqueOrThrow({ where: { id: "max" } });
    await db.session.create({ data: { id: "s1", token: "t1", userId: max.userId!, expiresAt: new Date(Date.now() + 3_600_000) } });
    await Acc.setPassword(db, { memberId: "max", password: "new password!" });
    expect(await db.session.count({ where: { userId: max.userId! } })).toBe(0);
    expect(await db.account.count({ where: { userId: max.userId!, providerId: "credential" } })).toBe(1);
  });

  it("the last admin login stays; removing a person removes their login", async () => {
    await expect(Acc.removeLogin(db, { memberId: "anna" })).rejects.toMatchObject({ code: "invalid" });
    const userId = (await db.member.findUniqueOrThrow({ where: { id: "max" } })).userId!;
    await deleteMember(db, { id: "max" });
    expect(await db.user.count({ where: { id: userId } })).toBe(0);
  });

  it("pairs a wall display: code, approval, a token handed out exactly once", async () => {
    const { code, secret } = await Acc.startPairing(db);
    expect(code).toMatch(/^\d{6}$/);
    expect(await Acc.pollPairing(db, secret)).toEqual({ status: "waiting" });
    await expect(Acc.approvePairing(db, { code: "000000" === code ? "111111" : "000000", name: "x" }, "u")).rejects.toMatchObject({ code: "notFound" });
    await Acc.approvePairing(db, { code, name: "Kitchen" }, "u");
    const r = await Acc.pollPairing(db, secret);
    expect(r.status).toBe("paired");
    expect(await Acc.pollPairing(db, secret)).toEqual({ status: "expired" });
    const token = (r as { token: string }).token;
    const device = await deviceFromToken(db, token);
    expect(device?.name).toBe("Kitchen");
    // The database only knows the token's hash.
    expect(await db.device.count({ where: { tokenHash: token } })).toBe(0);
    await Acc.revokeDevice(db, { id: device!.id });
    expect(await deviceFromToken(db, token)).toBeNull();
  });

  it("an expired pairing code can't be approved", async () => {
    const { code } = await Acc.startPairing(db, new Date(Date.now() - Acc.PAIRING_TTL_MS - 1000));
    await expect(Acc.approvePairing(db, { code, name: "x" }, "u")).rejects.toMatchObject({ code: "notFound" });
  });

  it("checks the PIN and pauses after five wrong tries", async () => {
    await expect(Acc.checkPin(db, "dev-a", { pin: "1234" })).rejects.toMatchObject({ code: "noPin" });
    await Acc.setPin(db, { pin: "2468" });
    expect(await Acc.checkPin(db, "dev-a", { pin: "2468" })).toBe(true);
    for (let i = 0; i < 5; i++) expect(await Acc.checkPin(db, "dev-b", { pin: "0000" }, 1_000)).toBe(false);
    await expect(Acc.checkPin(db, "dev-b", { pin: "2468" }, 2_000)).rejects.toMatchObject({ code: "tooManyAttempts" });
    expect(await Acc.checkPin(db, "dev-b", { pin: "2468" }, 70_000)).toBe(true);
  });
});

describe.skipIf(!TEST_DB)("only single sign-on (§20 D42)", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = await resetTestDatabase();
  }, 60_000);
  afterAll(() => db?.$disconnect());
  const input = {
    demo: false, household: "Müller", timezone: "Europe/Berlin", member: { name: "Anna", color: "#3B78C2", avatar: { kind: "initial" as const } },
    email: "anna@example.test",
  };

  it("setup needs a password while password sign-in is on", async () => {
    await expect(setupHousehold(db, input)).rejects.toMatchObject({ code: "invalid" });
    expect(await setupState(db)).toBe("new");
  });

  it("setup without password sign-in gives the admin an email-only login", async () => {
    await setupHousehold(db, { ...input, password: "ignored password" }, { passwordLogin: false });
    expect(await setupState(db)).toBe("done");
    const user = await db.user.findUniqueOrThrow({ where: { email: "anna@example.test" }, include: { accounts: true, member: true } });
    expect(user.accounts).toHaveLength(0);
    expect(user.member?.role).toBe("admin");
  });
});
