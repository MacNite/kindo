import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { can, getActor } from "@/server/actor";
import { verify } from "@/server/crypto";
import { env } from "@/server/env";
import { errorMessage, log } from "@/server/log";
import { notify } from "@/server/realtime";
import { exchangeCode } from "@/server/calendar/google";
import { addGoogle } from "@/server/connections";

export const dynamic = "force-dynamic";

/** Google sends the admin back here after consent; the refresh token is stored encrypted. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = env().APP_URL ?? url.origin;
  const back = (result: string) => NextResponse.redirect(new URL(`/settings?section=integrations&google=${result}`, origin));
  if (!can(await getActor(), "admin")) return NextResponse.redirect(new URL("/login", origin));
  const jar = await cookies();
  const expected = verify(jar.get("kindo_google_state")?.value);
  jar.delete("kindo_google_state");
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!expected || !state || state !== expected || !code) return back("failed");
  try {
    const { refreshToken, email } = await exchangeCode(code, `${origin}/api/integrations/google/callback`);
    await addGoogle(prisma, { email, refreshToken });
    await notify("events");
    return back("connected");
  } catch (e) {
    log.warn("google connect failed", { error: errorMessage(e) });
    return back("failed");
  }
}
