import type { CalendarSource, Connection, Event as EventRow } from "@prisma/client";
import { decryptSecret } from "../crypto";
import { env } from "../env";
import { UserError } from "../errors";
import { fetchChecked, readJson } from "../http";
import type { EditScope } from "@/lib/types";
import type { RemoteCalendar, RemoteEvent } from "./caldav";
import type { EventToWrite } from "./ical";
import type { CalendarProvider } from "./sync";

/**
 * Google Calendar (§5, §19.8, §20 D38) with the household's own OAuth client
 * (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). The refresh token is stored
 * encrypted; access tokens live in memory only.
 */
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"];
const apiBase = () => env().GOOGLE_API_BASE.replace(/\/+$/, "");
const oauthBase = () => env().GOOGLE_OAUTH_BASE.replace(/\/+$/, "");
export const authorizeUrl = () => env().GOOGLE_AUTHORIZE_URL;

export const googleClient = () => env().google;

/** Exchanges the code from the consent screen for a refresh token and the account's email. */
export async function exchangeCode(code: string, redirectUri: string) {
  const client = googleClient();
  if (!client) throw new UserError("invalid", "Google is not configured");
  const res = await fetchChecked(`${oauthBase()}/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: client.id, client_secret: client.secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const body = await readJson<{ refresh_token?: string; access_token?: string; id_token?: string; error?: string }>(res);
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
  const body = await readJson<{ access_token?: string; expires_in?: number; error?: string }>(res);
  if (!res.ok || !body.access_token) throw new UserError("remote", `Google: ${body.error ?? `HTTP ${res.status}`}`);
  tokens.set(c.id, { token: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

async function api<T>(c: Connection, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchChecked(`${apiBase()}/calendar/v3${path}`, {
    ...init, headers: { Authorization: `Bearer ${await accessToken(c)}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  if (res.status === 403) {
    const reasons = await errorReasons(res);
    // Google answers 403 for too many requests too: that is "try later", not "read-only".
    if (reasons.some((r) => RATE_LIMITED.has(r))) throw new UserError("remote", "Google: too many requests, trying again later");
    throw new UserError("readOnly", "Google: no write access");
  }
  if (res.status === 429) throw new UserError("remote", "Google: too many requests, trying again later");
  if (res.status === 412) throw new UserError("conflict", "Google: changed elsewhere");
  if (!res.ok) throw new UserError("remote", `Google: HTTP ${res.status}`);
  return readJson<T>(res);
}

/** Google's 403 reasons that mean "slow down" (usage limits), not "not allowed". */
const RATE_LIMITED = new Set(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "dailyLimitExceeded", "RATE_LIMIT_EXCEEDED"]);

/** The `reason`s in a Google API error body (`error.errors[].reason`, `error.details[].reason`). */
async function errorReasons(res: Response): Promise<string[]> {
  try {
    const body = await readJson<{ error?: { errors?: { reason?: string }[]; details?: { reason?: string }[]; status?: string } }>(res);
    return [...(body.error?.errors ?? []), ...(body.error?.details ?? [])].map((e) => e.reason ?? "").concat(body.error?.status ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

type GDate = { date?: string; dateTime?: string; timeZone?: string };
interface GEvent {
  id: string; etag?: string; status?: string; summary?: string; location?: string; start: GDate; end: GDate;
  recurringEventId?: string; originalStartTime?: GDate; extendedProperties?: { private?: Record<string, string> };
}
const toDate = (d: GDate) => (d.date ? new Date(`${d.date}T00:00:00Z`) : new Date(d.dateTime!));

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function body(e: EventToWrite) {
  return {
    summary: e.title, location: e.location,
    start: e.allDay ? { date: ymd(e.start) } : { dateTime: e.start.toISOString() },
    end: e.allDay ? { date: ymd(e.end) } : { dateTime: e.end.toISOString() },
    // Kindo's people travel along, like X-KINDO-MEMBERS in CalDAV.
    extendedProperties: { private: { kindoMembers: e.memberIds.join(" "), kindoUid: e.uid } },
  };
}

/**
 * An edit as a PATCH: only the fields that differ from what Kindo shows, so
 * Google keeps what other apps set (description, reminders, attendees,
 * colour, other private properties). Null clears a field.
 */
export function patchBody(row: Pick<EventRow, "title" | "start" | "end" | "allDay" | "location" | "memberIds">, e: EventToWrite, { times = true } = {}) {
  const out: Record<string, unknown> = {};
  const title = typeof row.title === "string" ? row.title : JSON.stringify(row.title);
  if (title !== e.title) out.summary = e.title;
  if ((row.location ?? "") !== (e.location ?? "")) out.location = e.location || null;
  if (times && (row.allDay !== e.allDay || row.start.getTime() !== e.start.getTime() || row.end.getTime() !== e.end.getTime())) {
    // Both kinds named, so a timed event can become a whole day and back.
    const when = (d: Date) => (e.allDay ? { date: ymd(d), dateTime: null } : { dateTime: d.toISOString(), date: null });
    out.start = when(e.start);
    out.end = when(e.end);
  }
  if (row.memberIds.join(" ") !== e.memberIds.join(" ")) out.extendedProperties = { private: { kindoMembers: e.memberIds.join(" ") } };
  return out;
}

/** A time's wall clock in a time zone, as milliseconds of a UTC date with the same fields. */
function wallClock(d: Date, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
}
const localDateTime = (wall: number) => new Date(wall).toISOString().slice(0, 19);

/**
 * An edit of the whole series, made on one occurrence (D69), as a PATCH of
 * the series: the fields that changed, and a new time of day in the series'
 * own time zone (Google keeps it at that wall-clock time across daylight
 * saving). Moving the series to another day, or between all-day and timed,
 * is left to Google Calendar.
 */
export function seriesPatch(master: Pick<GEvent, "start" | "end">, row: Pick<EventRow, "title" | "start" | "end" | "allDay" | "location" | "memberIds">, e: EventToWrite) {
  const out = patchBody(row, e, { times: false });
  if (row.allDay !== e.allDay) throw new UserError("invalid", "Google: a series stays all-day or timed");
  const zone = master.start.timeZone ?? "UTC";
  const day = (d: Date) => new Date(wallClock(d, zone)).toISOString().slice(0, 10);
  if (day(row.start) !== day(e.start)) throw new UserError("invalid", "Google: several occurrences move only within their day");
  const length = e.end.getTime() - e.start.getTime();
  const retimed = !e.allDay && wallClock(e.start, zone) !== wallClock(row.start, zone);
  if (retimed || length !== row.end.getTime() - row.start.getTime()) {
    if (e.allDay) {
      const end = new Date(toDate(master.start).getTime() + length);
      out.end = { date: ymd(end) };
    } else {
      const start = wallClock(toDate(master.start), zone);
      const time = (w: number) => w - Math.floor(w / 86_400_000) * 86_400_000;
      const newStart = retimed ? start - time(start) + time(wallClock(e.start, zone)) : start;
      out.start = { dateTime: localDateTime(newStart), timeZone: zone };
      out.end = { dateTime: localDateTime(newStart + length), timeZone: master.end.timeZone ?? zone };
    }
  }
  return out;
}

const eventPath = (s: CalendarSource, id: string) => `/calendars/${encodeURIComponent(s.remoteId!)}/events/${encodeURIComponent(id)}`;
const ifMatch = (etag?: string | null): Record<string, string> => (etag ? { "If-Match": etag } : {});

export const googleProvider: CalendarProvider = {
  async listCalendars(c): Promise<RemoteCalendar[]> {
    type Item = { id: string; summary: string; accessRole: string; backgroundColor?: string };
    const items: Item[] = [];
    let page: string | undefined;
    // A page at a time: an account with many subscribed calendars has more than one.
    do {
      const q = new URLSearchParams({ minAccessRole: "reader" });
      if (page) q.set("pageToken", page);
      const r = await api<{ items?: Item[]; nextPageToken?: string }>(c, `/users/me/calendarList?${q}`);
      items.push(...(r.items ?? []));
      page = r.nextPageToken;
    } while (page);
    return items.map((i) => ({ remoteId: i.id, name: i.summary, color: i.backgroundColor, readOnly: !["owner", "writer"].includes(i.accessRole) }));
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
          // An occurrence is its own event at Google, with the series' id and its original start.
          ...(e.recurringEventId ? { seriesId: e.recurringEventId, recurrenceId: toDate(e.originalStartTime ?? e.start) } : {}),
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
    const patch = patchBody(row, e);
    if (!Object.keys(patch).length) return;
    await api(c, `/calendars/${encodeURIComponent(s.remoteId!)}/events/${encodeURIComponent(row.href!)}`, {
      method: "PATCH", body: JSON.stringify(patch), headers: row.etag ? { "If-Match": row.etag } : {},
    });
  },
  async remove(c, s, row: EventRow) {
    await api(c, `/calendars/${encodeURIComponent(s.remoteId!)}/events/${encodeURIComponent(row.href!)}`, { method: "DELETE" });
  },
  /**
   * Google keeps each occurrence as an event of its own: changing or
   * cancelling one is a PATCH or DELETE of it, and Google records the
   * exception. The whole series is the recurring event itself. Both carry
   * the version Kindo saw, so a change made elsewhere meanwhile wins.
   */
  async changeSeries(c, s, row: EventRow, scope: EditScope, e) {
    if (scope === "following") throw new UserError("readOnly", "Google: this and following only in Google Calendar");
    if (scope === "occurrence") {
      if (e) return googleProvider.update!(c, s, row, e);
      return void (await api(c, eventPath(s, row.href!), { method: "DELETE", headers: ifMatch(row.etag) }));
    }
    if (!row.seriesId) throw new UserError("readOnly");
    // The occurrence first: if it changed or went since the last sync, the series isn't touched.
    const occurrence = await api<GEvent>(c, eventPath(s, row.href!));
    if (occurrence.status === "cancelled" || (row.etag && occurrence.etag !== row.etag)) throw new UserError("conflict", "Google: changed elsewhere");
    const master = await api<GEvent>(c, eventPath(s, row.seriesId));
    if (!e) return void (await api(c, eventPath(s, row.seriesId), { method: "DELETE", headers: ifMatch(master.etag) }));
    const patch = seriesPatch(master, row, e);
    if (!Object.keys(patch).length) return;
    await api(c, eventPath(s, row.seriesId), { method: "PATCH", body: JSON.stringify(patch), headers: ifMatch(master.etag) });
  },
};
