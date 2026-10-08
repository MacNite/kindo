import { prisma } from "@/server/db";
import { getActor } from "@/server/actor";
import { cameraSnapshot } from "@/server/cameras";
import { UserError } from "@/server/errors";
import { errorMessage, log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Sizes a screen may ask for; anything else is rounded to the next one. */
const HEIGHTS = [240, 480, 720];

/** A camera's latest still picture (§22), proxied: Frigate's address and login stay on the server. Never cached. */
export async function GET(req: Request, { params }: { params: Promise<{ cameraId: string }> }) {
  if (!(await getActor())) return new Response("unauthenticated", { status: 401 });
  const { cameraId } = await params;
  const asked = Number(new URL(req.url).searchParams.get("h")) || 480;
  const height = HEIGHTS.find((h) => h >= asked) ?? HEIGHTS[HEIGHTS.length - 1];
  try {
    const img = await cameraSnapshot(prisma, cameraId, height);
    return new Response(new Uint8Array(img.body), { headers: { "Content-Type": img.type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    const status = e instanceof UserError && e.code === "notFound" ? 404 : 502;
    if (status === 502) log.warn("camera picture failed", { camera: cameraId, error: errorMessage(e) });
    return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  }
}
