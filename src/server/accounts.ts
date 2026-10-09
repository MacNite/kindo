import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { randomCode, randomToken, sha256 } from "./crypto";
import { UserError, notFound } from "./errors";
import { id } from "./validation";

/**
 * Logins, kiosk devices and the settings PIN (§19.4). People and logins are
 * separate (§3): an admin gives an adult a login; children never get one.
 */
export const password = z.string().min(8).max(200);
export const pin = z.string().regex(/^\d{4,8}$/, "4 to 8 digits");
export const A = {
  createLogin: z.object({ memberId: id, email: z.string().trim().toLowerCase().email().max(200), password: password.optional() }),
  setPassword: z.object({ memberId: id, password }),
  byMember: z.object({ memberId: id }),
  approvePairing: z.object({ code: z.string().regex(/^\d{6}$/), name: z.string().trim().min(1).max(60) }),
  byId: z.object({ id }),
  renameDevice: z.object({ id, name: z.string().trim().min(1).max(60) }),
  setPin: z.object({ pin: pin.nullable() }),
  checkPin: z.object({ pin: z.string().max(20) }),
};
type In<K extends keyof typeof A> = z.output<(typeof A)[K]>;

// ── Logins ──────────────────────────────────────────────────────────────────
/**
 * Creates a login for an adult. Without a password the person can only use
 * single sign-on with that email (§20 D25).
 */
export async function createLogin(db: Tx, input: In<"createLogin">) {
  const member = await db.member.findUnique({ where: { id: input.memberId } });
  if (!member) throw notFound("member");
  if (member.role === "child") throw new UserError("invalid", "children don't have logins");
  if (member.userId) throw new UserError("conflict", "already has a login");
  const userId = randomUUID();
  try {
    await db.user.create({ data: { id: userId, name: member.name, email: input.email.trim().toLowerCase(), emailVerified: false } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new UserError("conflict", "email in use");
    throw e;
  }
  if (input.password) {
    await db.account.create({ data: { id: randomUUID(), accountId: userId, providerId: "credential", userId, password: await hashPassword(input.password) } });
  }
  await db.member.update({ where: { id: member.id }, data: { userId } });
  return userId;
}

/** Sets (or resets) a login's password, and signs it out everywhere. */
export async function setPassword(db: Tx, input: In<"setPassword">) {
  const member = await db.member.findUnique({ where: { id: input.memberId } });
  if (!member?.userId) throw notFound("login");
  const hash = await hashPassword(input.password);
  const existing = await db.account.findFirst({ where: { userId: member.userId, providerId: "credential" } });
  if (existing) await db.account.update({ where: { id: existing.id }, data: { password: hash } });
  else await db.account.create({ data: { id: randomUUID(), accountId: member.userId, providerId: "credential", userId: member.userId, password: hash } });
  await db.session.deleteMany({ where: { userId: member.userId } });
}

export async function removeLogin(db: Tx, input: In<"byMember">) {
  const member = await db.member.findUnique({ where: { id: input.memberId } });
  if (!member?.userId) return;
  await assertAnotherAdminLogin(db, member.id);
  await db.user.delete({ where: { id: member.userId } });
}

/**
 * A household always keeps an admin who can sign in. Without one nobody could
 * change settings, and once no login is left at all, setup would hand the
 * household to whoever opens it. Refuses to take an admin's role, person or
 * login away unless another admin with a login remains.
 */
export async function assertAnotherAdminLogin(db: Tx, memberId: string) {
  const me = await db.member.findUnique({ where: { id: memberId }, select: { role: true } });
  if (me?.role !== "admin") return;
  const others = await db.member.count({ where: { role: "admin", userId: { not: null }, id: { not: memberId } } });
  if (!others) throw new UserError("invalid", "the last admin login stays");
}

// ── Kiosk pairing ───────────────────────────────────────────────────────────
export const PAIRING_TTL_MS = 10 * 60_000;
/**
 * Codes waiting at once. Anyone can ask without signing in, so a few are
 * enough: more would only make a mistyped code more likely to pair a stranger.
 */
export const MAX_PENDING_PAIRINGS = 10;

/**
 * A wall display asks to be paired: it gets a code to show and a secret to
 * keep. A display asking again (a reload) replaces its own earlier request.
 */
export async function startPairing(db: Tx, now = new Date(), previousSecret?: string) {
  await db.pairingRequest.deleteMany({ where: { expiresAt: { lt: now } } });
  if (previousSecret) await db.pairingRequest.deleteMany({ where: { secretHash: sha256(previousSecret), approvedAt: null } });
  if ((await db.pairingRequest.count()) >= MAX_PENDING_PAIRINGS) throw new UserError("tooManyAttempts");
  const secret = randomToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await db.pairingRequest.create({ data: { code, secretHash: sha256(secret), expiresAt: new Date(now.getTime() + PAIRING_TTL_MS) } });
      return { code, secret, expiresAt: new Date(now.getTime() + PAIRING_TTL_MS) };
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  throw new UserError("server", "no free pairing code");
}

/** An admin confirms the code shown on the wall. */
export async function approvePairing(db: Tx, input: In<"approvePairing">, approvedBy: string, now = new Date()) {
  const req = await db.pairingRequest.findUnique({ where: { code: input.code } });
  if (!req || req.expiresAt < now) throw notFound("pairing code");
  await db.pairingRequest.update({ where: { id: req.id }, data: { approvedAt: now, deviceName: input.name, approvedBy } });
}

/**
 * The waiting display asks whether it has been approved. If so it gets its
 * device token, exactly once, and the request is gone.
 */
export async function pollPairing(db: Tx, secret: string | undefined, now = new Date()): Promise<{ status: "waiting" | "expired" } | { status: "paired"; token: string }> {
  if (!secret) return { status: "expired" };
  const req = await db.pairingRequest.findUnique({ where: { secretHash: sha256(secret) } });
  if (!req || req.expiresAt < now) return { status: "expired" };
  if (!req.approvedAt) return { status: "waiting" };
  const token = randomToken();
  await db.device.create({ data: { name: req.deviceName ?? "Wall display", tokenHash: sha256(token), pairedById: req.approvedBy, lastSeenAt: now } });
  await db.pairingRequest.delete({ where: { id: req.id } });
  return { status: "paired", token };
}

export async function revokeDevice(db: Tx, input: In<"byId">) {
  await db.device.updateMany({ where: { id: input.id, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Renames a paired display, e.g. after a typo at pairing. Its token stays valid. */
export async function renameDevice(db: Tx, input: In<"renameDevice">) {
  const r = await db.device.updateMany({ where: { id: input.id, revokedAt: null }, data: { name: input.name } });
  if (!r.count) throw notFound("device");
}

// ── The settings PIN ────────────────────────────────────────────────────────
export async function setPin(db: Tx, input: In<"setPin">) {
  await db.household.update({ where: { id: 1 }, data: { settingsPinHash: input.pin ? await hashPassword(input.pin) : null } });
}

/**
 * Failed PIN attempts per device: five, then a pause that doubles with every
 * further round of wrong tries (a minute, two, four, up to an hour) until the
 * right PIN comes, so even a four-digit PIN can't be guessed by trying. Kept
 * in memory: only a paired display can try, and it can't restart the server.
 */
const attempts = new Map<string, { fails: number; lockouts: number; until: number }>();
const MAX_FAILS = 5;
const LOCKOUT_MS = 60_000;
const MAX_LOCKOUT_MS = 60 * 60_000;

/** How long the n-th pause in a row lasts. */
export const pinLockoutMs = (n: number) => Math.min(LOCKOUT_MS * 2 ** Math.max(0, n - 1), MAX_LOCKOUT_MS);

export async function checkPin(db: Tx, deviceId: string, input: In<"checkPin">, now = Date.now()): Promise<boolean> {
  const a = attempts.get(deviceId);
  if (a && a.until > now) throw new UserError("tooManyAttempts");
  const h = await db.household.findUnique({ where: { id: 1 }, select: { settingsPinHash: true } });
  if (!h?.settingsPinHash) throw new UserError("noPin");
  const ok = await verifyPassword({ hash: h.settingsPinHash, password: input.pin });
  if (ok) {
    attempts.delete(deviceId);
    return true;
  }
  const fails = (a?.fails ?? 0) + 1;
  const lockouts = a?.lockouts ?? 0;
  attempts.set(deviceId, fails >= MAX_FAILS ? { fails: 0, lockouts: lockouts + 1, until: now + pinLockoutMs(lockouts + 1) } : { fails, lockouts, until: 0 });
  return false;
}
