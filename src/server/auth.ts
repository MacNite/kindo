import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { genericOAuth } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./db";
import { deriveKey } from "./crypto";
import { env } from "./env";
import { AUTH_COOKIE_PREFIX } from "./cookie-names";

/**
 * Logins (§19.4): email and password, and single sign-on through an OpenID
 * Connect provider such as authentik. Built on first use, so `next build`
 * never needs the runtime secrets.
 *
 * Nobody signs themselves up: an admin creates logins for adults
 * (src/server/accounts.ts), and single sign-on only signs in people whose
 * email already has a login. With KINDO_PASSWORD_LOGIN=false single sign-on
 * is the only way in (§20 D42).
 */
function createAuth() {
  const e = env();
  return betterAuth({
    appName: "Kindo",
    secret: deriveKey("auth").toString("base64"),
    baseURL: e.APP_URL,
    trustedOrigins: e.trustedOrigins,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: { enabled: e.passwordLogin, disableSignUp: true, minPasswordLength: 8 },
    // Better Auth only checks `enabled` when signing in; close the other password routes too.
    disabledPaths: e.passwordLogin ? [] : ["/sign-in/email", "/change-password", "/request-password-reset", "/reset-password", "/verify-password"],
    // Single sign-on links to the login an admin created for that email. Every
    // local login was created by the household's admin (nobody signs up) and the
    // provider is the household's own, so the local email needs no separate check.
    account: { accountLinking: { enabled: true, trustedProviders: ["oidc"], requireLocalEmailVerified: false } },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    advanced: { useSecureCookies: e.secureCookies, cookiePrefix: AUTH_COOKIE_PREFIX },
    telemetry: { enabled: false },
    plugins: [
      ...(e.oidc
        ? [genericOAuth({
          config: [{
            providerId: "oidc",
            discoveryUrl: `${e.OIDC_ISSUER!.replace(/\/$/, "")}/.well-known/openid-configuration`,
            clientId: e.OIDC_CLIENT_ID!,
            clientSecret: e.OIDC_CLIENT_SECRET!,
            scopes: ["openid", "email", "profile"],
            pkce: true,
            disableImplicitSignUp: true,
          }],
        })]
        : []),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { kindoAuth?: Auth };
export const getAuth = (): Auth => (g.kindoAuth ??= createAuth());
