import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Server-side crypto helpers. One configured secret (KINDO_SECRET_KEY) is
 * stretched into a separate key per purpose with HKDF, so a signature key can
 * never decrypt a stored secret and vice versa.
 */
export function deriveKey(purpose: "auth" | "cookies" | "secrets", secret = env().secretKey): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "kindo", `kindo:${purpose}`, 32));
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
/** A six-digit pairing code. */
export const randomCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** `value.expiry.signature`: a value that can't be forged or kept past its expiry. */
export function sign(value: string, ttlMs: number, now = Date.now()): string {
  const body = `${value}.${now + ttlMs}`;
  return `${body}.${createHmac("sha256", deriveKey("cookies")).update(body).digest("base64url")}`;
}

export function verify(signed: string | undefined, now = Date.now()): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  const j = signed.lastIndexOf(".", i - 1);
  if (i < 0 || j < 0) return null;
  const body = signed.slice(0, i);
  const expected = createHmac("sha256", deriveKey("cookies")).update(body).digest();
  const given = Buffer.from(signed.slice(i + 1), "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Number(signed.slice(j + 1, i)) < now) return null;
  return signed.slice(0, j);
}

/**
 * Integration secrets at rest (§17, §20 D26): AES-256-GCM, stored as
 * `v1:iv:tag:ciphertext`. They are decrypted only where a sync needs them
 * and never sent to a device.
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("secrets"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, data] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("unreadable secret");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey("secrets"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
