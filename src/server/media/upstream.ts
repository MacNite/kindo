import { UserError } from "../errors";

/**
 * Audio and covers from a media server, passed through to a screen (§23).
 * Unlike `fetchChecked` there is no limit on the body and no timeout once
 * the answer has started: an audiobook file is long and plays for hours.
 * Only the wait for the answer is bounded, and the screen going away stops
 * the download.
 */
export async function openUpstream(url: string, headers: Record<string, string>, { signal, timeoutMs = 15_000 }: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<Response> {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UserError("invalid", "http(s) only");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timed out")), timeoutMs);
  const stop = () => ctrl.abort(signal?.reason);
  signal?.addEventListener("abort", stop, { once: true });
  try {
    const res = await fetch(u, { headers, signal: ctrl.signal, redirect: "follow" });
    return res;
  } catch (e) {
    signal?.removeEventListener("abort", stop);
    const cause = e instanceof Error && e.cause instanceof Error ? ` (${(e.cause as NodeJS.ErrnoException).code ?? e.cause.message})` : "";
    throw new UserError("remote", `${u.host}: ${e instanceof Error ? e.message : String(e)}${cause}`);
  } finally {
    clearTimeout(timer);
  }
}

/** The headers of an upstream answer a screen may see: what a player needs to seek, nothing that names the server. */
export function passHeaders(res: Response, cache: string): Headers {
  const h = new Headers({ "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"]) {
    const v = res.headers.get(k);
    if (v) h.set(k, v);
  }
  return h;
}
