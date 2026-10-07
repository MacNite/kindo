"use server";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/types";
import type { z } from "zod";
import { prisma } from "../db";
import { getAuth } from "../auth";
import { setupHousehold, setupInput } from "../setup";
import { failure } from "./act";

/**
 * First-run setup, then signs the new admin in. Needs no login (there is
 * none yet) and refuses once anyone can sign in, so it can't be replayed.
 */
export async function setup(input: z.input<typeof setupInput>): Promise<ActionResult> {
  try {
    const data = setupInput.parse(input);
    await prisma.$transaction((tx) => setupHousehold(tx, data), { timeout: 30_000 });
    await getAuth().api.signInEmail({ body: { email: data.email, password: data.password }, headers: await headers() });
    return { ok: true, data: undefined };
  } catch (e) {
    return failure(e);
  }
}
