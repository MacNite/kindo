import { redirect } from "next/navigation";
import type { HouseholdWire } from "@/lib/types";
import { prisma } from "./db";
import { getActor, viewerOf } from "./actor";
import { loadSnapshot } from "./snapshot";

/**
 * What every household page needs before it renders (§19.4): a household
 * (else first-run setup), and a signed-in person or paired display (else the
 * sign-in page). Returns the snapshot for the store.
 */
export async function guardedSnapshot(): Promise<HouseholdWire> {
  const [households, users] = await Promise.all([prisma.household.count(), prisma.user.count()]);
  if (!households || !users) redirect("/setup");
  const actor = await getActor();
  if (!actor) redirect("/login");
  const snapshot = await loadSnapshot(prisma, await viewerOf(actor));
  if (!snapshot) redirect("/setup");
  return snapshot;
}
