import { UserError } from "../errors";
import { errorMessage, log } from "../log";
import { passHeaders } from "./upstream";

const STATUS: Partial<Record<string, number>> = { notFound: 404, forbidden: 403, invalid: 400 };

/**
 * The answer of a media route (§23): the upstream body as it streams, with
 * only the headers a player needs. A failure tells the screen its code, never
 * where the media server lives; the detail goes to the log.
 */
export async function mediaResponse(open: () => Promise<Response>, opts: { what: string; itemId?: string; cache: string; image?: boolean }): Promise<Response> {
  try {
    const res = await open();
    if (res.status === 401 || res.status === 403) throw new UserError("remote", `${opts.what}: the media server refused (HTTP ${res.status})`);
    if (res.status === 404) throw new UserError("notFound", `${opts.what}: HTTP 404`);
    if (!res.ok && res.status !== 206 && res.status !== 416) throw new UserError("remote", `${opts.what}: HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    // A cover must be a picture; anything else (an error page) is not passed on as one.
    if (opts.image && !type.startsWith("image/")) throw new UserError("notFound", `${opts.what}: not an image (${type})`);
    return new Response(res.body, { status: res.status, headers: passHeaders(res, opts.cache) });
  } catch (e) {
    const code = e instanceof UserError ? e.code : "remote";
    const status = STATUS[code] ?? 502;
    if (status !== 404) log.warn("media proxy failed", { what: opts.what, item: opts.itemId, status, error: errorMessage(e) });
    return new Response(code === "remote" || code === "server" ? "remote" : code, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
}
