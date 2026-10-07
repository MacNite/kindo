import { subscribe, type Change } from "@/server/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** How often a comment line keeps proxies from closing an idle stream. */
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events: tells every open screen that something changed (§19.2).
 * Carries only the topic, never data: the device refetches what it may see.
 */
export function GET(req: Request) {
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
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
