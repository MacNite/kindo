import type { MediaChoice, ShelfKind } from "@/lib/media";
import { UserError } from "../errors";
import { fetchChecked, readJson } from "../http";

/**
 * Jellyfin, music only (§23). Kindo signs in once as a Jellyfin user (best a
 * restricted one just for the children, §20 D61) and keeps that user's access
 * token, never the password. Everything Kindo reads, it reads as that user,
 * so Jellyfin's own parental controls and library access apply as well.
 */
export interface JellyfinTarget { url: string; token: string; userId: string }

const base = (url: string) => url.replace(/\/+$/, "");
/** Jellyfin's client header; the token, once there is one, rides in it. */
const authHeader = (token?: string) =>
  `MediaBrowser Client="Kindo", Device="Kindo", DeviceId="kindo-server", Version="1.0"${token ? `, Token="${token}"` : ""}`;
export const jellyfinHeaders = (token: string): Record<string, string> => ({ Authorization: authHeader(token) });

async function call<T>(url: string, path: string, init: { token?: string; body?: unknown; method?: "GET" | "POST"; on404?: UserError } = {}): Promise<T> {
  const res = await fetchChecked(`${base(url)}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { Authorization: authHeader(init.token), Accept: "application/json", ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    timeoutMs: 20_000,
  });
  if (res.status === 401 || res.status === 403) throw new UserError("remote", "Jellyfin refused the sign-in");
  if (res.status === 404) throw init.on404 ?? new UserError("remote", "no Jellyfin at this address (HTTP 404)");
  if (!res.ok) throw new UserError("remote", `Jellyfin: HTTP ${res.status}`);
  return readJson<T>(res);
}

/** Signs in as a Jellyfin user: the access token and the user's id. The password is not kept. */
export async function signIn(url: string, username: string, password: string): Promise<{ token: string; userId: string; name: string }> {
  const r = await call<{ AccessToken?: string; User?: { Id?: string; Name?: string } }>(url, "/Users/AuthenticateByName", { body: { Username: username, Pw: password } });
  if (!r.AccessToken || !r.User?.Id) throw new UserError("remote", "Jellyfin didn't sign in");
  return { token: r.AccessToken, userId: r.User.Id, name: r.User.Name ?? username };
}

/**
 * Quick Connect (D66): for a user who signs in through single sign-on and has
 * no password Jellyfin takes. Kindo asks for a code, someone signed in to
 * Jellyfin as that user enters it, and Kindo trades the secret behind the
 * code for the user's token. The secret never leaves the server.
 */
export async function quickConnectStart(url: string): Promise<{ secret: string; code: string }> {
  const on = await call<boolean>(url, "/QuickConnect/Enabled");
  if (on !== true) throw new UserError("quickConnectOff", "Quick Connect is off in Jellyfin");
  const r = await call<{ Secret?: string; Code?: string }>(url, "/QuickConnect/Initiate", { method: "POST" });
  if (!r.Secret || !r.Code) throw new UserError("remote", "Jellyfin didn't give a Quick Connect code");
  return { secret: r.Secret, code: r.Code };
}

/** Whether the code was entered yet. Jellyfin forgets a code after a few minutes. */
export async function quickConnectApproved(url: string, secret: string): Promise<boolean> {
  const r = await call<{ Authenticated?: boolean }>(url, `/QuickConnect/Connect?${new URLSearchParams({ secret })}`, { on404: new UserError("expired", "the Quick Connect code expired") });
  return r.Authenticated === true;
}

/** Signs in with an approved Quick Connect secret: the token and the user's id, as with a password. */
export async function quickConnectSignIn(url: string, secret: string): Promise<{ token: string; userId: string; name: string }> {
  const r = await call<{ AccessToken?: string; User?: { Id?: string; Name?: string } }>(url, "/Users/AuthenticateWithQuickConnect", { body: { Secret: secret } });
  if (!r.AccessToken || !r.User?.Id) throw new UserError("remote", "Jellyfin didn't sign in");
  return { token: r.AccessToken, userId: r.User.Id, name: r.User.Name ?? "" };
}

/** Checks a stored token: the user it belongs to. */
export async function whoAmI(url: string, token: string): Promise<{ userId: string; name: string }> {
  const r = await call<{ Id?: string; Name?: string }>(url, "/Users/Me", { token });
  if (!r.Id) throw new UserError("remote", "Jellyfin didn't say who signed in");
  return { userId: r.Id, name: r.Name ?? "" };
}

interface Item { Id: string; Name?: string; Type?: string; MediaType?: string; AlbumArtist?: string; RunTimeTicks?: number; ChildCount?: number }
const kindOf = (type?: string): ShelfKind => (type === "Playlist" ? "playlist" : type === "AudioBook" ? "book" : "album");

/** Albums, audio playlists and audiobooks the user may see, for the admin to pick. */
export async function browse(t: JellyfinTarget, search = ""): Promise<MediaChoice[]> {
  const q = new URLSearchParams({
    userId: t.userId, IncludeItemTypes: "MusicAlbum,Playlist,AudioBook", Recursive: "true", SortBy: "SortName", SortOrder: "Ascending",
    Limit: "300", Fields: "ChildCount", ...(search.trim() ? { SearchTerm: search.trim() } : {}),
  });
  const r = await call<{ Items?: Item[] }>(t.url, `/Items?${q}`, { token: t.token });
  return (r.Items ?? [])
    // Video playlists stay out: this is listening.
    .filter((i) => i.Type !== "Playlist" || !i.MediaType || i.MediaType === "Audio")
    .map((i) => ({ remoteId: i.Id, kind: kindOf(i.Type), name: i.Name ?? i.Id, detail: i.AlbumArtist || undefined }));
}

/** An album's or playlist's songs, in order: Jellyfin's id of each and its length in seconds. */
export async function tracks(t: JellyfinTarget, remoteId: string, kind: ShelfKind): Promise<{ remoteId: string; title: string; duration: number }[]> {
  const path = kind === "playlist"
    ? `/Playlists/${encodeURIComponent(remoteId)}/Items?${new URLSearchParams({ userId: t.userId })}`
    : `/Items?${new URLSearchParams({ userId: t.userId, ParentId: remoteId, IncludeItemTypes: "Audio", Recursive: "true", SortBy: "ParentIndexNumber,IndexNumber,SortName" })}`;
  const r = await call<{ Items?: Item[] }>(t.url, path, { token: t.token });
  return (r.Items ?? [])
    .filter((i) => !i.MediaType || i.MediaType === "Audio")
    .map((i) => ({ remoteId: i.Id, title: i.Name ?? "", duration: (i.RunTimeTicks ?? 0) / 10_000_000 }));
}

/**
 * The address of a song's sound: played as it is where browsers and speakers
 * can, otherwise turned into MP3 by Jellyfin.
 */
export const streamUrl = (t: JellyfinTarget, trackId: string) => `${base(t.url)}/Audio/${encodeURIComponent(trackId)}/universal?${new URLSearchParams({
  UserId: t.userId, DeviceId: "kindo-server", MaxStreamingBitrate: "320000",
  Container: "mp3,aac,m4a|aac,m4b|aac,flac,webma,webm|webm,wav,ogg,opus",
  TranscodingContainer: "mp3", TranscodingProtocol: "http", AudioCodec: "mp3",
})}`;

export const coverUrl = (t: Pick<JellyfinTarget, "url">, remoteId: string) => `${base(t.url)}/Items/${encodeURIComponent(remoteId)}/Images/Primary?maxHeight=480&quality=85`;
