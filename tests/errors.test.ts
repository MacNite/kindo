import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import * as H from "@/server/household";
import { UserError, expectedError } from "@/server/errors";
import { TEST_DB, resetTestDatabase } from "./db";

/** Saving something another screen just removed is "not found", not a server error. */
describe.skipIf(!TEST_DB)("changes to rows that are gone", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = await resetTestDatabase();
  }, 60_000);
  afterAll(() => db?.$disconnect());

  const failsWith = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (e) {
      const mapped = expectedError(e);
      return mapped instanceof UserError ? mapped.code : "server";
    }
    return "ok";
  };

  it("maps Prisma's missing-record error to notFound", async () => {
    expect(await failsWith(() => H.saveReward(db, { id: "gone", emoji: "🍦", title: "Ice cream", cost: 5 }))).toBe("notFound");
    expect(await failsWith(() => H.saveShoppingList(db, { id: "gone", name: "Market", icon: "🧺" }))).toBe("notFound");
    expect(await failsWith(() => H.saveImportantDate(db, { id: "gone", kind: "birthday", title: "Oma", date: "1950-01-01", yearly: true }))).toBe("notFound");
  });

  it("leaves other errors alone", () => {
    const bug = new Error("bug");
    expect(expectedError(bug)).toBe(bug);
  });
});
