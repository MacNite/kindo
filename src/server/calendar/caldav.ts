import { createDAVClient, type DAVCalendar } from "tsdav";
import { UserError } from "../errors";
import { errorMessage } from "../log";
import { timedFetch } from "../http";
import { parseCalendar, buildEventIcs, updateEventIcs, type EventToWrite, type ParsedEvent } from "./ical";

/**
 * Nextcloud and any other CalDAV server (§5, §19.5). Credentials are an app
 * password; this module only ever runs on the server.
 */
export interface CalDavAccount { url: string; username: string; password: string }
export interface RemoteCalendar { remoteId: string; name: string; color?: string; ctag?: string; readOnly: boolean }
export interface RemoteEvent extends ParsedEvent { href: string; etag?: string }

async function client(a: CalDavAccount) {
  try {
    return await createDAVClient({
      serverUrl: a.url,
      credentials: { username: a.username, password: a.password },
      authMethod: "Basic",
      defaultAccountType: "caldav",
      fetch: timedFetch(),
    });
  } catch (e) {
    const msg = errorMessage(e);
    throw new UserError("remote", /401|unauthori[sz]ed/i.test(msg) ? "wrong username or app password" : msg);
  }
}

/** The account's calendars that hold events (not task lists or address books). */
export async function listCalendars(a: CalDavAccount): Promise<RemoteCalendar[]> {
  const c = await client(a);
  const cals = await c.fetchCalendars();
  return cals
    .filter((cal) => !cal.components || cal.components.includes("VEVENT"))
    .map((cal) => ({
      remoteId: cal.url,
      name: typeof cal.displayName === "string" && cal.displayName ? cal.displayName : decodeURIComponent(cal.url.replace(/\/$/, "").split("/").pop() ?? "Calendar"),
      color: cal.calendarColor,
      ctag: cal.ctag ?? cal.syncToken,
      // Nextcloud shares read-only calendars with this privilege missing; we let the family decide too.
      readOnly: false,
    }));
}

const asCalendar = (remoteId: string): DAVCalendar => ({ url: remoteId });

/** Every event in [from, to), recurring series expanded, with each object's address and version. */
export async function fetchEvents(a: CalDavAccount, remoteId: string, window: { from: Date; to: Date }): Promise<RemoteEvent[]> {
  const c = await client(a);
  const objects = await c.fetchCalendarObjects({
    calendar: asCalendar(remoteId),
    timeRange: { start: window.from.toISOString(), end: window.to.toISOString() },
  });
  const out: RemoteEvent[] = [];
  for (const o of objects) {
    if (typeof o.data !== "string" || !o.data.includes("BEGIN:VEVENT")) continue;
    try {
      for (const e of parseCalendar(o.data, window)) out.push({ ...e, href: o.url, etag: o.etag });
    } catch {
      // One broken object must not hide the rest of the calendar.
    }
  }
  return out;
}

async function check(res: Response, what: string) {
  if (!res.ok) throw new UserError(res.status === 403 ? "readOnly" : res.status === 412 ? "conflict" : "remote", `${what}: HTTP ${res.status}`);
}

export async function createEvent(a: CalDavAccount, remoteId: string, e: EventToWrite) {
  const c = await client(a);
  await check(await c.createCalendarObject({ calendar: asCalendar(remoteId), filename: `${e.uid}.ics`, iCalString: buildEventIcs(e) }), "create");
}

/**
 * Updates in place: reads the event as the server has it and changes only
 * what Kindo edits, so a description, alarms or attendees set elsewhere
 * survive. The etag Kindo last saw makes it fail rather than overwrite
 * someone else's newer change.
 */
export async function updateEvent(a: CalDavAccount, remoteId: string, href: string, etag: string | undefined, e: EventToWrite) {
  const c = await client(a);
  const [current] = await c.fetchCalendarObjects({ calendar: asCalendar(remoteId), objectUrls: [href], urlFilter: () => true });
  if (typeof current?.data !== "string" || !current.data.includes("BEGIN:VEVENT")) throw new UserError("conflict", "update: the event is gone from the server");
  let data: string;
  try {
    data = updateEventIcs(current.data, e);
  } catch (err) {
    throw new UserError("remote", `update: ${errorMessage(err)}`);
  }
  await check(await c.updateCalendarObject({ calendarObject: { url: href, etag: etag ?? current.etag, data } }), "update");
}

export async function deleteEvent(a: CalDavAccount, href: string, etag: string | undefined) {
  const c = await client(a);
  await check(await c.deleteCalendarObject({ calendarObject: { url: href, etag } }), "delete");
}
