import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { can, getActor } from "@/server/actor";
import { randomToken, sign } from "@/server/crypto";
import { env } from "@/server/env";
import { GOOGLE_SCOPES, authorizeUrl, googleClient } from "@/server/calendar/google";

export const dynamic = "force-dynamic";

/** Starts connecting a Google account (§19.8): admin only, with a signed state against forged callbacks. */
export async function GET(req: Request) {
  const origin = env().APP_URL ?? new URL(req.url).origin;
  if (!can(await getActor(), "admin")) return NextResponse.redirect(new URL("/login", origin));
  const client = googleClient();
  if (!client) return NextResponse.redirect(new URL("/settings?section=integrations&google=notConfigured", origin));
  const state = randomToken(16);
  (await cookies()).set("kindo_google_state", sign(state, 10 * 60_000), { httpOnly: true, sameSite: "lax", secure: env().secureCookies, path: "/", maxAge: 600 });
  const q = new URLSearchParams({
    client_id: client.id, redirect_uri: `${origin}/api/integrations/google/callback`, response_type: "code",
    scope: GOOGLE_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return NextResponse.redirect(`${authorizeUrl()}?${q}`);
}
