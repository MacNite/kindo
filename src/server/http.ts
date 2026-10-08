import { UserError } from "./errors";

/**
 * Outbound HTTP for integrations (§17): server-side only, http(s) only, with
 * a timeout and a size limit so a misbehaving feed can't stall or flood the app.
 */
export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  maxBytes?: number;
}

export async function fetchChecked(url: string, { timeoutMs = 20_000, maxBytes = 10 * 1024 * 1024, ...init }: FetchOptions = {}): Promise<Response> {
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
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new UserError("remote", `${u.host}: response too large`);
  return res;
}

/** GETs a text resource (an ICS feed), failing on HTTP errors and oversized bodies. */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
  const res = await fetchChecked(url, opts);
  if (!res.ok) throw new UserError("remote", `${new URL(url).host}: HTTP ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new UserError("remote", `${new URL(url).host}: response too large`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** webcal:// is how calendar apps hand out subscriptions; it means https. */
export const normaliseFeedUrl = (url: string) => url.trim().replace(/^webcals?:\/\//i, "https://");
