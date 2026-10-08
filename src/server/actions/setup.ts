"use server";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/types";
import type { z } from "zod";
import { prisma } from "../db";
import { getAuth } from "../auth";
import { env } from "../env";
import { setupHousehold, setupInput } from "../setup";
import { failure } from "./act";

/**
 * First-run setup, then signs the new admin in. Needs no login (there is
 * none yet) and refuses once anyone can sign in, so it can't be replayed.
 * Without password sign-in (§20 D42) the admin signs in through single
 * sign-on next, so `signedIn` is false.
 */
export async function setup(input: z.input<typeof setupInput>): Promise<ActionResult<{ signedIn: boolean }>> {
  try {
    const data = setupInput.parse(input);
    const { passwordLogin } = env();
    await prisma.$transaction((tx) => setupHousehold(tx, data, { passwordLogin }), { timeout: 30_000 });
    if (!passwordLogin) return { ok: true, data: { signedIn: false } };
    await getAuth().api.signInEmail({ body: { email: data.email, password: data.password! }, headers: await headers() });
    return { ok: true, data: { signedIn: true } };
  } catch (e) {
    return failure(e);
  }
}
