import type { CalendarSource, Connection, Event as EventRow } from "@prisma/client";
import { decryptSecret } from "../crypto";
import { UserError } from "../errors";
import { fetchChecked } from "../http";
import type { RemoteCalendar, RemoteEvent } from "./caldav";
import type { EventToWrite } from "./ical";
import type { CalendarProvider } from "./sync";

/**
 * Google Calendar (§5, §19.8, §20 D38) with the household's own OAuth client
 * (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). The refresh token is stored
 * encrypted; access tokens live in memory only.
 */
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"];
const apiBase = () => process.env.GOOGLE_API_BASE ?? "https://www.googleapis.com";
export const oauthBase = () => process.env.GOOGLE_OAUTH_BASE ?? "https://oauth2.googleapis.com";
export const authorizeUrl = () => process.env.GOOGLE_AUTHORIZE_URL ?? "https://accounts.google.com/o/oauth2/v2/auth";

export function googleClient() {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

/** Exchanges the code from the consent screen for a refresh token and the account's email. */
export async function exchangeCode(code: string, redirectUri: string) {
  const client = googleClient();
  if (!client) throw new UserError("invalid", "Google is not configured");
  const res = await fetchChecked(`${oauthBase()}/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: client.id, client_secret: client.secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const body = (await res.json()) as { refresh_token?: string; access_token?: string; id_token?: string; error?: string };
  if (!res.ok || !body.refresh_token) throw new UserError("remote", `Google: ${body.error ?? "no refresh token"}`);
  let email = "Google";
  try {
    email = (JSON.parse(Buffer.from(body.id_token!.split(".")[1], "base64url").toString()) as { email?: string }).email ?? email;
  } catch {
    // An account without an email claim still works; it's just named "Google".
  }
  return { refreshToken: body.refresh_token, email };
}

const tokens = new Map<string, { token: string; until: number }>();
async function accessToken(c: Connection): Promise<string> {
  const cached = tokens.get(c.id);
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const client = googleClient();
  if (!client) throw new UserError("remote", "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
  const res = await fetchChecked(`${oauthBase()}/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: decryptSecret(c.secret!), client_id: client.id, client_secret: client.secret, grant_type: "refresh_token" }),
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) throw new UserError("remote", `Google: ${body.error ?? `HTTP ${res.status}`}`);
  tokens.set(c.id, { token: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

async function api<T>(c: Connection, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchChecked(`${apiBase()}/calendar/v3${path}`, {
    ...init, headers: { Authorization: `Bearer ${await accessToken(c)}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  if (res.status === 403) throw new UserError("readOnly", "Google: no write access");
  if (res.status === 412) throw new UserError("conflict", "Google: changed elsewhere");
  if (!res.ok) throw new UserError("remote", `Google: HTTP ${res.status}`);
  return (await res.json()) as T;
}

type GDate = { date?: string; dateTime?: string };
interface GEvent {
  id: string; etag?: string; status?: string; summary?: string; location?: string; start: GDate; end: GDate;
  recurringEventId?: string; extendedProperties?: { private?: Record<string, string> };
}
const toDate = (d: GDate) => (d.date ? new Date(`${d.date}T00:00:00Z`) : new Date(d.dateTime!));

function body(e: EventToWrite) {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return {
    summary: e.title, location: e.location,
    start: e.allDay ? { date: ymd(e.start) } : { dateTime: e.start.toISOString() },
    end: e.allDay ? { date: ymd(e.end) } : { dateTime: e.end.toISOString() },
    // Kindo's people travel along, like X-KINDO-MEMBERS in CalDAV.
    extendedProperties: { private: { kindoMembers: e.memberIds.join(" "), kindoUid: e.uid } },
  };
}

export const googleProvider: CalendarProvider = {
  async listCalendars(c): Promise<RemoteCalendar[]> {
    const r = await api<{ items: { id: string; summary: string; accessRole: string; backgroundColor?: string }[] }>(c, "/users/me/calendarList?minAccessRole=reader");
    return r.items.map((i) => ({ remoteId: i.id, name: i.summary, color: i.backgroundColor, readOnly: !["owner", "writer"].includes(i.accessRole) }));
  },
  async fetchEvents(c, s: CalendarSource, window): Promise<RemoteEvent[]> {
    const out: RemoteEvent[] = [];
    let page: string | undefined;
    do {
      const q = new URLSearchParams({ timeMin: window.from.toISOString(), timeMax: window.to.toISOString(), singleEvents: "true", maxResults: "2500", orderBy: "startTime" });
      if (page) q.set("pageToken", page);
      const r = await api<{ items: GEvent[]; nextPageToken?: string }>(c, `/calendars/${encodeURIComponent(s.remoteId!)}/events?${q}`);
      for (const e of r.items) {
        if (e.status === "cancelled") continue;
        const members = e.extendedProperties?.private?.kindoMembers;
        out.push({
          // Kindo's own events keep the uid Kindo gave them, so they sync back under the same id.
          uid: e.extendedProperties?.private?.kindoUid ?? e.id, summary: e.summary ?? "", location: e.location, start: toDate(e.start), end: toDate(e.end), allDay: Boolean(e.start.date),
          recurring: Boolean(e.recurringEventId), memberIds: members ? members.split(/\s+/).filter(Boolean) : undefined, href: e.id, etag: e.etag,
        });
      }
      page = r.nextPageToken;
    } while (page);
    return out;
  },
  async create(c, s, e) {
    await api(c, `/calendars/${encodeURIComponent(s.remoteId!)}/events`, { method: "POST", body: JSON.stringify(body(e)) });
  },
  async update(c, s, row: EventRow, e) {
    await api(c, `/calendars/${encodeURIComponent(s.remoteId!)}/events/${encodeURIComponent(row.href!)}`, {
      method: "PUT", body: JSON.stringify(body(e)), headers: row.etag ? { "If-Match": row.etag } : {},
    });
  },
  async remove(c, s, row: EventRow) {
    await api(c, `/calendars/${encodeURIComponent(s.remoteId!)}/events/${encodeURIComponent(row.href!)}`, { method: "DELETE" });
  },
};
