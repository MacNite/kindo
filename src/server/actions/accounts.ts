"use server";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import QRCode from "qrcode";
import type { ActionResult } from "@/lib/types";
import { prisma } from "../db";
import { getAuth } from "../auth";
import { env } from "../env";
import { sign } from "../crypto";
import { UserError } from "../errors";
import * as Acc from "../accounts";
import { DEVICE_COOKIE, PAIRING_COOKIE, PIN_COOKIE, PIN_TTL_MS, getActor, requireActor } from "../actor";
import { act, failure } from "./act";
import { Limiter } from "../rate-limit";

/** Our own cookies follow the same Secure rule as the session cookie. */
const cookieOptions = (maxAgeSeconds: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: env().secureCookies, path: "/", maxAge: maxAgeSeconds });
/** Browsers cap cookie lifetimes at 400 days; /api/stream renews the device cookie while the screen is in use. */
const DEVICE_MAX_AGE = 400 * 24 * 3600;

// ── Signing in and out ──────────────────────────────────────────────────────
const credentials = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) });
/** Ten wrong passwords per email and address in fifteen minutes, then a pause. */
const signInLimiter = new Limiter(10, 15 * 60_000);

export async function signIn(input: z.input<typeof credentials>): Promise<ActionResult> {
  let key = "";
  try {
    const body = credentials.parse(input);
    const h = await headers();
    key = `${body.email}|${h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "direct"}`;
    if (signInLimiter.blocked(key)) throw new UserError("tooManyAttempts");
    await getAuth().api.signInEmail({ body, headers: h });
    signInLimiter.clear(key);
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "invalid" };
    // A wrong email or password comes back as an API error: say only that it didn't work.
    if (e && typeof e === "object" && "statusCode" in e) {
      if (key) signInLimiter.fail(key);
      return { ok: false, error: "wrongLogin" };
    }
    return failure(e);
  }
}

export async function signOut(): Promise<ActionResult> {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch {
    // Already signed out.
  }
  return { ok: true, data: undefined };
}

const changeOwn = z.object({ currentPassword: z.string().min(1).max(200), newPassword: Acc.password });
export const changePassword = act(changeOwn, async (_db, input, actor) => {
  if (actor.kind !== "user") throw new UserError("forbidden");
  try {
    await getAuth().api.changePassword({ body: { ...input, revokeOtherSessions: true }, headers: await headers() });
  } catch (e) {
    if (e && typeof e === "object" && "statusCode" in e) throw new UserError("wrongLogin");
    throw e;
  }
}, { level: "view", topic: null });

// ── Logins (admin) ──────────────────────────────────────────────────────────
export const createLogin = act(Acc.A.createLogin, async (db, input) => { await Acc.createLogin(db, input); }, { level: "admin" });
export const setLoginPassword = act(Acc.A.setPassword, Acc.setPassword, { level: "admin", topic: null });
export const removeLogin = act(Acc.A.byMember, Acc.removeLogin, { level: "admin" });

/** Admin-only details for Settings: paired devices, and whether single sign-on is set up. */
export async function getAccountAdmin() {
  try {
    await requireActor("admin");
    const devices = await prisma.device.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "asc" } });
    return {
      ok: true as const,
      data: { oidc: env().oidc ? env().OIDC_NAME : null, devices: devices.map((d) => ({ id: d.id, name: d.name, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt ?? undefined })) },
    };
  } catch (e) {
    return failure(e);
  }
}

// ── Kiosk pairing ───────────────────────────────────────────────────────────
/** On the wall display: ask to be paired. Returns the code to show and a QR code for the admin's phone. */
export async function startPairing(): Promise<ActionResult<{ code: string; qr: string; expiresAt: Date }>> {
  try {
    const p = await Acc.startPairing(prisma);
    (await cookies()).set(PAIRING_COOKIE, p.secret, cookieOptions(Acc.PAIRING_TTL_MS / 1000));
    const origin = env().APP_URL ?? (await headers()).get("origin") ?? "";
    const qr = await QRCode.toString(`${origin}/settings?section=devices&code=${p.code}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
    return { ok: true, data: { code: p.code, qr, expiresAt: p.expiresAt } };
  } catch (e) {
    return failure(e);
  }
}

/** On the wall display: has an admin confirmed the code yet? */
export async function pollPairing(): Promise<ActionResult<"waiting" | "expired" | "paired">> {
  try {
    const jar = await cookies();
    const r = await Acc.pollPairing(prisma, jar.get(PAIRING_COOKIE)?.value);
    if (r.status === "paired") {
      jar.set(DEVICE_COOKIE, r.token, cookieOptions(DEVICE_MAX_AGE));
      jar.delete(PAIRING_COOKIE);
    }
    return { ok: true, data: r.status };
  } catch (e) {
    return failure(e);
  }
}

export const approvePairing = act(Acc.A.approvePairing, async (db, input, actor) => {
  await Acc.approvePairing(db, input, actor.kind === "user" ? actor.userId : "device");
}, { level: "admin", topic: null });
export const revokeDevice = act(Acc.A.byId, Acc.revokeDevice, { level: "admin", topic: null });

// ── The settings PIN ────────────────────────────────────────────────────────
/** Only a signed-in admin sets the PIN, never a wall that the PIN itself unlocked. */
export const setPin = act(Acc.A.setPin, async (db, input, actor) => {
  if (actor.kind !== "user") throw new UserError("forbidden");
  await Acc.setPin(db, input);
}, { level: "admin" });

/** On a wall display: unlock planning and settings for a few minutes. */
export async function unlockWithPin(input: z.input<typeof Acc.A.checkPin>): Promise<ActionResult> {
  try {
    const actor = await getActor();
    if (actor?.kind !== "device") throw new UserError("forbidden");
    const ok = await Acc.checkPin(prisma, actor.deviceId, Acc.A.checkPin.parse(input));
    if (!ok) throw new UserError("wrongPin");
    (await cookies()).set(PIN_COOKIE, sign(actor.deviceId, PIN_TTL_MS), cookieOptions(PIN_TTL_MS / 1000));
    return { ok: true, data: undefined };
  } catch (e) {
    return failure(e);
  }
}

/** On a wall display: lock again before the time runs out. */
export async function lockAgain(): Promise<ActionResult> {
  (await cookies()).delete(PIN_COOKIE);
  return { ok: true, data: undefined };
}
