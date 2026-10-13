import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { verifyPassword } from "better-auth/crypto";
import { createDemoLogin, createHousehold, seedDemo, wipeDemo } from "@/server/demo/seed";
import { TEST_DB, resetTestDatabase } from "./db";

describe.skipIf(!TEST_DB)("the throwaway demo (§20 D73)", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = await resetTestDatabase();
  }, 60_000);
  afterAll(() => db?.$disconnect());

  it("gives Anna a ready login", async () => {
    await db.$transaction(async (tx) => {
      await seedDemo(tx);
      await createDemoLogin(tx, "Anna@Demo.Kindo", "kindo-demo");
    }, { timeout: 60_000 });
    const anna = await db.member.findUniqueOrThrow({ where: { id: "anna" }, include: { user: { include: { accounts: true } } } });
    expect(anna.user?.email).toBe("anna@demo.kindo");
    expect(await verifyPassword({ hash: anna.user!.accounts[0].password!, password: "kindo-demo" })).toBe(true);
  });

  it("wipes the demo and loads it again as new", async () => {
    await db.member.update({ where: { id: "anna" }, data: { name: "Changed" } });
    await db.$transaction(async (tx) => {
      await wipeDemo(tx);
      await seedDemo(tx);
      await createDemoLogin(tx, "anna@demo.kindo", "kindo-demo");
    }, { timeout: 60_000 });
    expect((await db.member.findUniqueOrThrow({ where: { id: "anna" } })).name).toBe("Anna");
    expect(await db.user.count()).toBe(1);
  });

  it("never wipes a real household or gives it a demo login", async () => {
    await db.$transaction((tx) => wipeDemo(tx));
    await createHousehold(db, { name: "Real family", timezone: "Europe/Berlin" });
    await expect(db.$transaction((tx) => wipeDemo(tx))).rejects.toThrow(/never wiped/);
    await expect(createDemoLogin(db, "a@b.de", "kindo-demo")).rejects.toThrow(/only/);
    expect(await db.household.count()).toBe(1);
  });
});
