import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { Role, Viewer } from "@/lib/types";
import { getAuth } from "./auth";
import { prisma, type Tx } from "./db";
import { sha256, verify } from "./crypto";
import { UserError } from "./errors";

/**
 * Who is asking (§19.4): a signed-in person, or a paired kiosk device. A
 * device acts with a person's rights only for a few minutes after someone
 * enters the settings PIN on it.
 */
export type Actor =
  | { kind: "user"; userId: string; memberId: string; role: Role; name: string }
  | { kind: "device"; deviceId: string; name: string; elevated: boolean };

/**
 * - view:   see the household
 * - tick:   tick off routines and chores, shopping and tasks (what a wall is for)
 * - manage: plan and change things, approve extras, spend points
 * - admin:  people, logins, devices, the household, integrations
 */
export type Level = "view" | "tick" | "manage" | "admin";

export const DEVICE_COOKIE = "kindo_device";
export const PIN_COOKIE = "kindo_pin";
export const PAIRING_COOKIE = "kindo_pairing";
/** How long a PIN unlocks a wall display. */
export const PIN_TTL_MS = 10 * 60_000;

export function can(actor: Actor | null, level: Level): boolean {
  if (!actor) return false;
  if (level === "view" || level === "tick") return true;
  // The PIN makes a wall a grown-up's screen, never an admin's (§20 D27): the
  // PIN is shared and short, so people, logins, devices and integrations stay
  // with a signed-in admin.
  if (actor.kind === "device") return level === "manage" && actor.elevated;
  return level === "manage" ? actor.role !== "child" : actor.role === "admin";
}

/** Resolves a device token (from its cookie) to a device that hasn't been revoked. */
export async function deviceFromToken(db: Tx, token: string | undefined) {
  if (!token) return null;
  const device = await db.device.findUnique({ where: { tokenHash: sha256(token) } });
  if (!device || device.revokedAt) return null;
  // Throttled "last seen", so Settings can show which screens are alive.
  if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 5 * 60_000) {
    await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  }
  return device;
}

/** The actor for the current request. Cached per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() }).catch(() => null);
  if (session) {
    const member = await prisma.member.findUnique({ where: { userId: session.user.id } });
    // A login always belongs to a person; one whose person was removed gets nowhere.
    if (member) return { kind: "user", userId: session.user.id, memberId: member.id, role: member.role, name: member.name };
  }
  const jar = await cookies();
  const device = await deviceFromToken(prisma, jar.get(DEVICE_COOKIE)?.value);
  if (device) return { kind: "device", deviceId: device.id, name: device.name, elevated: verify(jar.get(PIN_COOKIE)?.value) === device.id };
  return null;
});

/** Throws the error the UI knows how to handle: sign in, enter the PIN, or not allowed. */
export async function requireActor(level: Level): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new UserError("unauthenticated");
  if (can(actor, level)) return actor;
  if (actor.kind === "device") throw new UserError("pin");
  throw new UserError("forbidden");
}

/** What the screens may know about who is looking at them. */
export async function viewerOf(actor: Actor, db: Tx = prisma): Promise<Viewer> {
  const h = await db.household.findUnique({ where: { id: 1 }, select: { settingsPinHash: true } });
  const pinSet = Boolean(h?.settingsPinHash);
  if (actor.kind === "device") {
    return { kind: "device", name: actor.name, canManage: can(actor, "manage"), isAdmin: false, elevated: actor.elevated, pinSet };
  }
  return { kind: "user", name: actor.name, memberId: actor.memberId, role: actor.role, canManage: can(actor, "manage"), isAdmin: can(actor, "admin"), pinSet };
}
