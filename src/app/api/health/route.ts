import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness for the container healthcheck and compose. There is no database
 * yet; once there is, this adds a `SELECT 1` round-trip like BrewCore's.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", service: "kindo", version: process.env.KINDO_VERSION ?? "dev", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
