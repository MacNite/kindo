import { ZodError } from "zod";
import { prisma } from "@/server/db";
import { getActor } from "@/server/actor";
import { K, answerOffer } from "@/server/cameras";
import { UserError } from "@/server/errors";
import { errorMessage, log } from "@/server/log";
import { Limiter } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A screen opens a handful of streams a minute at most; more is a loop gone wrong. */
const limiter = new Limiter(30, 60_000);
const STATUS: Partial<Record<string, number>> = { unauthenticated: 401, pin: 403, forbidden: 403, notFound: 404, invalid: 400, busy: 409, remote: 502 };

/**
 * The WebRTC handshake for live view and talking (§22, §20 D48): the
 * browser's offer in, go2rtc's answer out, through Frigate's authenticated
 * proxy. The browser names a camera by Kindo's id; which stream that is, and
 * whether it may talk, is decided on the server for every request. Media then
 * flows directly between the browser and go2rtc's WebRTC port.
 */
export async function POST(req: Request, { params }: { params: Promise<{ cameraId: string }> }) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const key = actor.kind === "user" ? actor.userId : actor.deviceId;
  if (limiter.blocked(key)) return Response.json({ error: "tooManyAttempts" }, { status: 429 });
  limiter.fail(key);
  if (!req.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "invalid" }, { status: 415 });
  const { cameraId } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const input = K.sdp.parse({ ...body, cameraId });
    const sdp = await answerOffer(prisma, input, actor);
    return Response.json({ sdp }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const code = e instanceof UserError ? e.code : e instanceof ZodError || e instanceof SyntaxError ? "invalid" : "server";
    if (code === "remote" || code === "server") log.warn("camera handshake failed", { camera: cameraId, error: errorMessage(e) });
    return Response.json({ error: code }, { status: STATUS[code] ?? 500, headers: { "Cache-Control": "no-store" } });
  }
}
