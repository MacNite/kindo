import { cookies } from "next/headers";
import { subscribe, type Change } from "@/server/realtime";
import { DEVICE_COOKIE, getActor } from "@/server/actor";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** How often a comment line keeps proxies from closing an idle stream. */
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events: tells every open screen that something changed (§19.2).
 * Carries only the topic, never data: the device refetches what it may see.
 */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return new Response("unauthenticated", { status: 401 });
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send("retry: 3000\n\n");
      const unsubscribe = subscribe((c: Change) => send(`event: change\ndata: ${JSON.stringify(c)}\n\n`));
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  const headers = new Headers({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  // A wall display reconnects here all the time: renew its device cookie, so
  // the browsers' 400-day cookie limit never unpairs a screen that is in use.
  if (actor.kind === "device") {
    const token = (await cookies()).get(DEVICE_COOKIE)?.value;
    if (token) headers.append("Set-Cookie", `${DEVICE_COOKIE}=${token}; Path=/; Max-Age=${400 * 24 * 3600}; HttpOnly; SameSite=Lax${env().secureCookies ? "; Secure" : ""}`);
  }
  return new Response(stream, { headers });
}
