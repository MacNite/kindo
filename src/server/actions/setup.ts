"use server";
import { prisma } from "../db";
import { setupHousehold, setupInput } from "../setup";
import { act } from "./act";

/** First-run setup. Refuses once a household exists, so it can't be replayed later. */
export const setup = act(setupInput, async (_db, input) => prisma.$transaction((tx) => setupHousehold(tx, input), { timeout: 30_000 }));
