import { prisma } from "@/server/db";
import { can, getActor } from "@/server/actor";
import { assist } from "@/server/assist";
import { UserError } from "@/server/errors";
import { errorMessage, log } from "@/server/log";
import { Limiter } from "@/server/rate-limit";
import { MAX_VOICE_BYTES } from "@/lib/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A person says a few commands a minute; more is a button stuck down or a loop. */
const limiter = new Limiter(20, 60_000);
const STATUS: Partial<Record<string, number>> = { unauthenticated: 401, pin: 403, forbidden: 403, notFound: 404, invalid: 400, remote: 502 };

/**
 * One spoken command (§24, §20 D62): 16 kHz 16-bit mono PCM from a held
 * button, to Home Assistant's Assist and back as words and sound. Adults, or
 * a wall unlocked with the PIN, like talking at the door (§22).
 */
export async function POST(req: Request) {
  const fail = (code: string) => Response.json({ error: code }, { status: STATUS[code] ?? 500, headers: { "Cache-Control": "no-store" } });
  const actor = await getActor();
  if (!actor) return fail("unauthenticated");
  if (!can(actor, "manage")) return fail(actor.kind === "device" ? "pin" : "forbidden");
  const key = actor.kind === "user" ? actor.userId : actor.deviceId;
  if (limiter.blocked(key)) return Response.json({ error: "tooManyAttempts" }, { status: 429 });
  limiter.fail(key);
  if (req.headers.get("content-type") !== "application/octet-stream") return Response.json({ error: "invalid" }, { status: 415 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_VOICE_BYTES) return Response.json({ error: "invalid" }, { status: 413 });
  try {
    const body = await readCapped(req, MAX_VOICE_BYTES);
    if (!body) return Response.json({ error: "invalid" }, { status: 413 });
    if (body.length < 3200 || body.length % 2) throw new UserError("invalid", "16-bit PCM, between 0.1 and 12 seconds");
    const reply = await assist(prisma, body);
    return Response.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const code = e instanceof UserError ? e.code : "server";
    if (code === "remote" || code === "server") log.warn("assist failed", { error: errorMessage(e) });
    return fail(code);
  }
}

/** The body, or null as soon as it grows past `max` (a missing Content-Length doesn't let a large one through). */
async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
