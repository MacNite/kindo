import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { UserError } from "./errors";
import { createHousehold, hasHousehold, seedDemo } from "./demo/seed";
import { createLogin, password } from "./accounts";
import { avatar, color } from "./validation";

export const setupInput = z.object({
  demo: z.boolean(),
  household: z.string().trim().min(1).max(80),
  timezone: z.string().min(1).max(64),
  member: z.object({ name: z.string().trim().min(1).max(40), color, avatar }),
  email: z.string().trim().toLowerCase().email().max(200),
  /** Required unless password sign-in is turned off (§20 D42). */
  password: password.optional(),
});

/** Where first-run setup stands: nothing yet, a household without any login (e.g. after an upgrade), or done. */
export async function setupState(db: Tx): Promise<"new" | "claim" | "done"> {
  if (!(await hasHousehold(db))) return "new";
  return (await db.user.count()) ? "done" : "claim";
}

/**
 * First-run setup (§20 D11, D24): creates the household (or loads the demo
 * family) and the first admin's login. A household that exists without any
 * login, e.g. one created before accounts existed, is claimed by its first
 * admin instead. Refuses once anyone can sign in. Without password sign-in
 * (§20 D42) the admin's login takes no password: they sign in through single
 * sign-on with that email.
 */
export async function setupHousehold(db: Tx, input: z.output<typeof setupInput>, { passwordLogin = true } = {}) {
  if (passwordLogin && !input.password) throw new UserError("invalid", "password required");
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    throw new UserError("invalid", "unknown time zone");
  }
  const state = await setupState(db);
  if (state === "done") throw new UserError("conflict", "already set up");
  let memberId: string;
  if (state === "claim") {
    const admin = await db.member.findFirst({ where: { role: "admin" }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    memberId = admin?.id ?? (await db.member.create({ data: { name: input.member.name, role: "admin", color: input.member.color, avatar: input.member.avatar as Prisma.InputJsonValue } })).id;
  } else if (input.demo) {
    await seedDemo(db, new Date(), input.timezone);
    memberId = "anna";
  } else {
    await createHousehold(db, { name: input.household, timezone: input.timezone });
    memberId = (await db.member.create({
      data: { name: input.member.name, role: "admin", color: input.member.color, avatar: input.member.avatar as Prisma.InputJsonValue },
    })).id;
  }
  await createLogin(db, { memberId, email: input.email, password: passwordLogin ? input.password : undefined });
  return { memberId };
}
