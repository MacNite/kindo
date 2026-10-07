import { z } from "zod";

/**
 * Server configuration from the environment. Parsed once per process.
 * Everything here stays on the server (§17).
 */
const bool = z.enum(["true", "false", "1", "0", ""]).optional().transform((v) => v === "true" || v === "1");
const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional());
const optionalString = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

/** Only for development and tests; production refuses to start without a real key. */
export const DEV_SECRET = "kindo-development-secret-do-not-use-in-production";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** The address families open Kindo at. Sets the sign-in callback URLs and whether cookies are Secure. */
  APP_URL: optionalUrl,
  /** Further origins Kindo is reached at (comma-separated), e.g. a LAN IP next to the hostname. */
  KINDO_TRUSTED_ORIGINS: optionalString,
  /** Signs sessions and device cookies, and encrypts integration secrets (§20 D26). At least 32 characters. */
  KINDO_SECRET_KEY: optionalString,
  /** Loads the demo family into an empty database on first start (§20 D11). */
  KINDO_DEMO: bool,
  /** Single sign-on through an OpenID Connect provider such as authentik (§19.4). */
  OIDC_ISSUER: optionalUrl,
  OIDC_CLIENT_ID: optionalString,
  OIDC_CLIENT_SECRET: optionalString,
  OIDC_NAME: z.string().default("authentik"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema> & { secretKey: string; secureCookies: boolean; oidc: boolean; trustedOrigins: string[] };
let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const e = parsed.data;
  let secretKey = e.KINDO_SECRET_KEY;
  if (!secretKey || secretKey.length < 32) {
    if (process.env.NODE_ENV === "production" && process.env.KINDO_ALLOW_DEV_SECRET !== "true") {
      throw new Error("KINDO_SECRET_KEY must be set to at least 32 random characters (e.g. `openssl rand -base64 32`).");
    }
    secretKey = DEV_SECRET;
  }
  const trustedOrigins = [e.APP_URL, ...(e.KINDO_TRUSTED_ORIGINS?.split(",") ?? [])]
    .map((o) => o?.trim().replace(/\/$/, ""))
    .filter((o): o is string => Boolean(o));
  return (cached = {
    ...e,
    secretKey,
    // Secure cookies only over HTTPS: a family LAN on plain HTTP must still be able to sign in.
    secureCookies: e.APP_URL?.startsWith("https://") ?? false,
    oidc: Boolean(e.OIDC_ISSUER && e.OIDC_CLIENT_ID && e.OIDC_CLIENT_SECRET),
    trustedOrigins,
  });
}

/** For tests: forget the parsed configuration. */
export function resetEnvCache() {
  cached = undefined;
}
