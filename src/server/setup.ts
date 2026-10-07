import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { UserError } from "./errors";
import { createHousehold, hasHousehold, seedDemo } from "./demo/seed";
import { avatar, color } from "./validation";

export const setupInput = z.object({
  demo: z.boolean(),
  household: z.string().trim().min(1).max(80),
  timezone: z.string().min(1).max(64),
  member: z.object({ name: z.string().trim().min(1).max(40), color, avatar }),
});

/**
 * First-run setup (§20 D11): creates the household and its first admin, or
 * loads the demo family. Only ever runs once.
 */
export async function setupHousehold(db: Tx, input: z.output<typeof setupInput>) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    throw new UserError("invalid", "unknown time zone");
  }
  if (await hasHousehold(db)) throw new UserError("conflict", "already set up");
  if (input.demo) {
    await seedDemo(db, new Date(), input.timezone);
    return { memberId: "anna" };
  }
  await createHousehold(db, { name: input.household, timezone: input.timezone });
  const m = await db.member.create({
    data: { name: input.member.name, role: "admin", color: input.member.color, avatar: input.member.avatar as Prisma.InputJsonValue },
  });
  return { memberId: m.id };
}
