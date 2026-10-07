import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness for the container healthcheck and compose: the app answers and reaches PostgreSQL. */
export async function GET() {
  const base = { service: "kindo", version: process.env.KINDO_VERSION ?? "dev", time: new Date().toISOString() };
  const headers = { "Cache-Control": "no-store" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", ...base, database: "ok" }, { headers });
  } catch {
    return NextResponse.json({ status: "error", ...base, database: "unreachable" }, { status: 503, headers });
  }
}
