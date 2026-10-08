import { UserError } from "../errors";
import { fetchChecked, readJson } from "../http";

/**
 * Immich (§13, §19.6). Several servers can be connected; each has its own API
 * key, which stays on the Kindo server: devices only ever see proxied images.
 */
export interface ImmichServer { url: string; apiKey: string }
export interface ImmichAlbum { id: string; name: string; count: number }
export interface ImmichAsset { id: string; takenAt?: Date; place?: string }

const base = (s: ImmichServer) => s.url.replace(/\/+$/, "").replace(/\/api$/, "");

async function call<T>(s: ImmichServer, path: string, body?: unknown): Promise<T> {
  const res = await fetchChecked(`${base(s)}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-api-key": s.apiKey, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    timeoutMs: 30_000,
  });
  if (res.status === 401 || res.status === 403) throw new UserError("remote", "Immich refused the API key");
  if (!res.ok) throw new UserError("remote", `Immich: HTTP ${res.status}`);
  return readJson<T>(res);
}
const get = <T>(s: ImmichServer, path: string) => call<T>(s, path);

/** Checks the key and returns the server's albums: the user's own and those shared with them. */
export async function listAlbums(s: ImmichServer): Promise<ImmichAlbum[]> {
  type A = { id: string; albumName: string; assetCount: number };
  const [own, shared] = await Promise.all([get<A[]>(s, "/albums"), get<A[]>(s, "/albums?shared=true").catch(() => [] as A[])]);
  const byId = new Map([...own, ...shared].map((a) => [a.id, { id: a.id, name: a.albumName, count: a.assetCount }]));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The album's photos (videos stay out of the photo frame), with date and place.
 * Album responses no longer carry their assets (Immich v3), so they come from
 * the metadata search, a page at a time: `nextCursor` from v3.2, `nextPage` before.
 */
export async function listAssets(s: ImmichServer, albumId: string): Promise<ImmichAsset[]> {
  type Asset = { id: string; type: string; isTrashed?: boolean; fileCreatedAt?: string; localDateTime?: string; exifInfo?: { dateTimeOriginal?: string | null; city?: string | null; country?: string | null } };
  type Page = { assets: { items: Asset[]; nextPage?: string | null; nextCursor?: string | null } };
  const found: Asset[] = [];
  let next: { cursor: string } | { page: number } | undefined = { page: 1 };
  while (next) {
    const { assets }: Page = await call<Page>(s, "/search/metadata", { albumIds: [albumId], type: "IMAGE", withExif: true, size: 1000, ...next });
    found.push(...assets.items);
    // An empty page ends it too, so a server that keeps naming a next page can't loop forever.
    next = !assets.items.length ? undefined : assets.nextCursor ? { cursor: assets.nextCursor } : assets.nextPage ? { page: Number(assets.nextPage) } : undefined;
  }
  return found
    .filter((a) => a.type === "IMAGE" && !a.isTrashed)
    .map((a) => {
      const when = a.exifInfo?.dateTimeOriginal ?? a.localDateTime ?? a.fileCreatedAt;
      const place = [a.exifInfo?.city, a.exifInfo?.country].filter(Boolean).join(", ");
      return { id: a.id, takenAt: when ? new Date(when) : undefined, place: place || undefined };
    });
}

export type ThumbSize = "thumbnail" | "preview";

/** The image itself, for the proxy. */
export async function fetchThumbnail(s: ImmichServer, assetId: string, size: ThumbSize): Promise<{ body: Buffer; type: string }> {
  const res = await fetchChecked(`${base(s)}/api/assets/${encodeURIComponent(assetId)}/thumbnail?size=${size}`, {
    headers: { "x-api-key": s.apiKey }, timeoutMs: 30_000, maxBytes: 25 * 1024 * 1024,
  });
  if (!res.ok) throw new UserError(res.status === 404 ? "notFound" : "remote", `Immich: HTTP ${res.status}`);
  return { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "image/jpeg" };
}
