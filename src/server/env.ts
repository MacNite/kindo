import { join } from "node:path";
import { z } from "zod";
import { LOG_LEVELS, log } from "./log";

/**
 * Server configuration from the environment. Parsed once per process; a
 * value that doesn't parse stops the server at start with a message naming
 * it (src/instrumentation-node.ts). Everything here stays on the server (§17).
 */
const unset = (v: unknown) => (v === "" ? undefined : v);
const bool = z.enum(["true", "false", "1", "0", ""]).optional().transform((v) => v === "true" || v === "1");
/** Like `bool`, but unset means on. */
const boolOn = z.enum(["true", "false", "1", "0", ""]).optional().transform((v) => v === undefined || v === "" || v === "true" || v === "1");
const optionalUrl = z.preprocess(unset, z.string().url().optional());
const optionalString = z.preprocess(unset, z.string().optional());
const url = (fallback: string) => z.preprocess(unset, z.string().url().default(fallback));
/** A whole number in [min, max]; unset or empty means `fallback`. */
const int = (fallback: number, min: number, max: number) => z.preprocess(unset, z.coerce.number().int().min(min).max(max).default(fallback));

/** Only for development and tests; production refuses to start without a real key. */
const DEV_SECRET = "kindo-development-secret-do-not-use-in-production";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** The address families open Kindo at. Sets the sign-in callback URLs and whether cookies are Secure. */
  APP_URL: optionalUrl,
  /** Further origins Kindo is reached at (comma-separated), e.g. a LAN IP next to the hostname. */
  KINDO_TRUSTED_ORIGINS: optionalString,
  /** Signs sessions and device cookies, and encrypts integration secrets (§20 D26). At least 32 characters. */
  KINDO_SECRET_KEY: optionalString,
  /** Lets a production server start with the development key. Only for throwaway installs and CI. */
  KINDO_ALLOW_DEV_SECRET: bool,
  // KINDO_DEMO (§20 D11) is read by the migrate image (docker/migrate.sh), not by the app.
  /** Single sign-on through an OpenID Connect provider such as authentik (§19.4). */
  OIDC_ISSUER: optionalUrl,
  OIDC_CLIENT_ID: optionalString,
  OIDC_CLIENT_SECRET: optionalString,
  OIDC_NAME: z.string().default("authentik"),
  /** `false` leaves single sign-on as the only way to sign in. Ignored while single sign-on isn't set up (§20 D42). */
  KINDO_PASSWORD_LOGIN: boolOn,
  /**
   * A reverse proxy in front of Kindo sets X-Forwarded-For. Only then is that
   * header the client's address; without a proxy anyone could write it.
   */
  KINDO_TRUST_PROXY: bool,
  /** The household's own Google OAuth client (§20 D38). Both, or Google stays off. */
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  /** Google's addresses; changed only by tests. */
  GOOGLE_API_BASE: url("https://www.googleapis.com"),
  GOOGLE_OAUTH_BASE: url("https://oauth2.googleapis.com"),
  GOOGLE_AUTHORIZE_URL: url("https://accounts.google.com/o/oauth2/v2/auth"),
  /** Minutes between syncs of connected calendars (§20 D29). */
  KINDO_SYNC_MINUTES: int(5, 1, 24 * 60),
  /** Where proxied photos are cached on disk (§20 D34); `/data/cache` in the image. */
  KINDO_CACHE_DIR: optionalString,
  /** The photo cache's size in MB; least recently shown go first (§20 D34). */
  KINDO_PHOTO_CACHE_MB: int(500, 10, 1_000_000),
  /** `off`: this instance never runs the background jobs (§20 D21), e.g. a second app container. */
  KINDO_JOBS: z.preprocess(unset, z.enum(["on", "off"]).default("on")),
  LOG_LEVEL: z.preprocess((v) => (typeof v === "string" && v ? v.toLowerCase() : undefined), z.enum(LOG_LEVELS).default("info")),
});

export type Env = z.infer<typeof schema> & {
  secretKey: string; secureCookies: boolean; oidc: boolean; passwordLogin: boolean; trustedOrigins: string[];
  google: { id: string; secret: string } | null; cacheDir: string; jobs: boolean;
};
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
    if (process.env.NODE_ENV === "production" && !e.KINDO_ALLOW_DEV_SECRET) {
      throw new Error("KINDO_SECRET_KEY must be set to at least 32 random characters (e.g. `openssl rand -base64 32`).");
    }
    secretKey = DEV_SECRET;
  }
  const trustedOrigins = [e.APP_URL, ...(e.KINDO_TRUSTED_ORIGINS?.split(",") ?? [])]
    .map((o) => o?.trim().replace(/\/$/, ""))
    .filter((o): o is string => Boolean(o));
  const oidc = Boolean(e.OIDC_ISSUER && e.OIDC_CLIENT_ID && e.OIDC_CLIENT_SECRET);
  // Never lock everyone out: without single sign-on, passwords stay the way in.
  if (!e.KINDO_PASSWORD_LOGIN && !oidc) log.warn("KINDO_PASSWORD_LOGIN=false is ignored: single sign-on isn't set up (OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET)");
  if (Boolean(e.GOOGLE_CLIENT_ID) !== Boolean(e.GOOGLE_CLIENT_SECRET)) log.warn("Google Calendar stays off: set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  return (cached = {
    ...e,
    secretKey,
    // Secure cookies only over HTTPS: a family LAN on plain HTTP must still be able to sign in.
    secureCookies: e.APP_URL?.startsWith("https://") ?? false,
    oidc,
    passwordLogin: e.KINDO_PASSWORD_LOGIN || !oidc,
    trustedOrigins,
    google: e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET ? { id: e.GOOGLE_CLIENT_ID, secret: e.GOOGLE_CLIENT_SECRET } : null,
    cacheDir: e.KINDO_CACHE_DIR ?? join(process.cwd(), "data", "cache"),
    jobs: e.KINDO_JOBS === "on",
  });
}

/** For tests: forget the parsed configuration. */
export function resetEnvCache() {
  cached = undefined;
}
