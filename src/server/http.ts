import { UserError } from "./errors";

/**
 * Outbound HTTP for integrations (§17): server-side only, http(s) only, with
 * a timeout and a size limit so a misbehaving feed can't stall or flood the app.
 */
export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The response with its body cut off at `maxBytes`: reading past it
 * (`json()`, `text()`, `arrayBuffer()`) fails with "response too large" and
 * stops the download, whether or not the server sent a Content-Length.
 */
function capped(res: Response, maxBytes: number, host: string): Response {
  if (!res.body) return res;
  let size = 0;
  const limit = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > maxBytes) controller.error(new UserError("remote", `${host}: response too large`));
      else controller.enqueue(chunk);
    },
  });
  return new Response(res.body.pipeThrough(limit), { status: res.status, statusText: res.statusText, headers: res.headers });
}

export async function fetchChecked(url: string, { timeoutMs = 20_000, maxBytes = DEFAULT_MAX_BYTES, ...init }: FetchOptions = {}): Promise<Response> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new UserError("invalid", "not a URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UserError("invalid", "http(s) only");
  let res: Response;
  try {
    res = await fetch(u, { ...init, redirect: init.redirect ?? "follow", signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    // Node's fetch says only "fetch failed"; the cause names it (ECONNREFUSED, ENOTFOUND, a certificate error).
    const cause = e instanceof Error && e.cause instanceof Error ? ` (${(e.cause as NodeJS.ErrnoException).code ?? e.cause.message})` : "";
    throw new UserError("remote", `${u.host}: ${e instanceof Error ? e.message : String(e)}${cause}`);
  }
  // Refused early when the server says so; otherwise counted while reading.
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new UserError("remote", `${u.host}: response too large`);
  }
  return capped(res, maxBytes, u.host);
}

/** A body read from `fetchChecked` as JSON. A body cut off at the size limit fails as "response too large", not as broken JSON. */
export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UserError("remote", `not JSON (HTTP ${res.status})`);
  }
}

/** GETs a text resource (an ICS feed), failing on HTTP errors and oversized bodies. */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const res = await fetchChecked(url, opts);
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new UserError("remote", `${new URL(url).host}: HTTP ${res.status}`);
  }
  return res.text();
}

/**
 * The `fetch` handed to tsdav (CalDAV, CardDAV): the same timeout as every
 * other integration call, so a Nextcloud that stops answering can't hold a
 * sync, or the request that started it, forever.
 */
export const timedFetch = (timeoutMs = 30_000): typeof fetch => (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) });

/** webcal:// is how calendar apps hand out subscriptions; it means https. */
export const normaliseFeedUrl = (url: string) => url.trim().replace(/^webcals?:\/\//i, "https://");
