import { isFinished, type MediaChoice } from "@/lib/media";
import { UserError } from "../errors";
import { fetchChecked } from "../http";

/**
 * Audiobookshelf (§23). Kindo uses an account's API key (Settings → Users in
 * Audiobookshelf, or Settings → API Keys from 2.26). The account's own
 * library access and "explicit content" switch apply to everything Kindo
 * reads, and the place in a book is saved in the account, so a child with
 * their own account keeps their own place (§20 D61).
 */
export interface AbsTarget { url: string; token: string }

const base = (url: string) => url.replace(/\/+$/, "");
export const absHeaders = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

async function call<T>(t: AbsTarget, path: string, init: { method?: string; body?: unknown; allow404?: boolean } = {}): Promise<T | null> {
  const res = await fetchChecked(`${base(t.url)}${path}`, {
    method: init.method ?? "GET",
    headers: { ...absHeaders(t.token), Accept: "application/json", ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    timeoutMs: 20_000,
  });
  if (res.status === 401 || res.status === 403) throw new UserError("remote", "Audiobookshelf refused the API key");
  if (res.status === 404 && init.allow404) return null;
  if (res.status === 404) throw new UserError("remote", "no Audiobookshelf at this address (HTTP 404)");
  if (!res.ok) throw new UserError("remote", `Audiobookshelf: HTTP ${res.status}`);
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UserError("remote", `Audiobookshelf: not JSON (HTTP ${res.status})`);
  }
}

/** Checks the key: the account it belongs to. */
export async function whoAmI(t: AbsTarget): Promise<{ id: string; username: string }> {
  const me = await call<{ id?: string; username?: string }>(t, "/api/me");
  if (!me?.id) throw new UserError("remote", "Audiobookshelf didn't say who this key belongs to");
  return { id: me.id, username: me.username ?? "" };
}

interface Item { id: string; media?: { metadata?: { title?: string; authorName?: string } } }

/** The audiobooks the account may see, for the admin to pick. Podcasts stay out. */
export async function browse(t: AbsTarget, search = ""): Promise<MediaChoice[]> {
  const libs = (await call<{ libraries?: { id: string; mediaType?: string }[] }>(t, "/api/libraries"))?.libraries ?? [];
  const found: MediaChoice[] = [];
  const s = search.trim().toLowerCase();
  for (const lib of libs.filter((l) => (l.mediaType ?? "book") === "book")) {
    const r = await call<{ results?: Item[] }>(t, `/api/libraries/${encodeURIComponent(lib.id)}/items?${new URLSearchParams({ limit: "500", sort: "media.metadata.title", minified: "1" })}`);
    for (const i of r?.results ?? []) {
      const name = i.media?.metadata?.title ?? i.id;
      const author = i.media?.metadata?.authorName || undefined;
      if (s && !`${name} ${author ?? ""}`.toLowerCase().includes(s)) continue;
      found.push({ remoteId: i.id, kind: "book", name, detail: author });
    }
  }
  return found.slice(0, 300);
}

interface AudioFile { ino: string; index?: number; duration?: number; exclude?: boolean; metadata?: { filename?: string } }

/** A book's audio files, in order: their file id and length in seconds. */
export async function tracks(t: AbsTarget, remoteId: string): Promise<{ remoteId: string; title: string; duration: number }[]> {
  const item = await call<{ media?: { audioFiles?: AudioFile[]; metadata?: { title?: string } } }>(t, `/api/items/${encodeURIComponent(remoteId)}?expanded=1`);
  const files = (item?.media?.audioFiles ?? []).filter((f) => !f.exclude).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return files.map((f, i) => ({
    remoteId: f.ino, duration: f.duration ?? 0,
    title: f.metadata?.filename?.replace(/\.[a-z0-9]+$/i, "") || `${item?.media?.metadata?.title ?? ""} ${i + 1}`.trim(),
  }));
}

/** The account's place in a book, in seconds; 0 when it hasn't started. */
export async function progress(t: AbsTarget, remoteId: string): Promise<{ position: number; finished: boolean }> {
  const p = await call<{ currentTime?: number; isFinished?: boolean }>(t, `/api/me/progress/${encodeURIComponent(remoteId)}`, { allow404: true });
  return { position: p?.currentTime ?? 0, finished: Boolean(p?.isFinished) };
}

/** Saves the account's place in a book. */
export async function saveProgress(t: AbsTarget, remoteId: string, position: number, duration: number) {
  const done = isFinished(position, duration);
  await call(t, `/api/me/progress/${encodeURIComponent(remoteId)}`, {
    method: "PATCH",
    body: { currentTime: position, duration, progress: duration > 0 ? Math.min(1, position / duration) : 0, isFinished: done },
  });
}

export const streamUrl = (t: Pick<AbsTarget, "url">, remoteId: string, fileId: string) => `${base(t.url)}/api/items/${encodeURIComponent(remoteId)}/file/${encodeURIComponent(fileId)}`;
export const coverUrl = (t: Pick<AbsTarget, "url">, remoteId: string) => `${base(t.url)}/api/items/${encodeURIComponent(remoteId)}/cover?width=480`;
