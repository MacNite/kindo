import type { DAVCalendar, DAVClient, DAVResponse } from "tsdav";
import { UserError } from "../errors";
import { errorMessage } from "../log";
import { withDav, type DavAccount } from "../dav";
import { parseCalendar, buildEventIcs, updateEventIcs, type EventToWrite, type ParsedEvent } from "./ical";

/**
 * Nextcloud and any other CalDAV server (§5, §19.5). Credentials are an app
 * password; this module only ever runs on the server. Requests go through
 * one reused login per account (see `withDav`, D60).
 */
export type CalDavAccount = DavAccount;
export interface RemoteCalendar { remoteId: string; name: string; color?: string; ctag?: string; readOnly: boolean }
export interface RemoteEvent extends ParsedEvent { href: string; etag?: string }

const caldav = <T>(a: CalDavAccount, work: (c: DAVClient) => Promise<T>) => withDav(a, "caldav", work);

/** A property's text, however the XML parser handed it over. */
const text = (v: unknown): string | undefined => {
  if (typeof v === "string" || typeof v === "number") return String(v);
  const t = (v as { _cdata?: unknown; _text?: unknown } | undefined)?._cdata ?? (v as { _text?: unknown } | undefined)?._text;
  return typeof t === "string" ? t : undefined;
};
const componentNames = (comp: unknown) =>
  (Array.isArray(comp) ? comp : comp ? [comp] : []).map((c) => (c as { _attributes?: { name?: unknown } })?._attributes?.name).filter((n): n is string => typeof n === "string");

/**
 * The account's calendars that hold events (not task lists or address books).
 * One PROPFIND on the calendar home: tsdav's `fetchCalendars` would ask once
 * more for every calendar, whether Kindo shows it or not.
 */
export async function listCalendars(a: CalDavAccount): Promise<RemoteCalendar[]> {
  return caldav(a, async (c) => {
    const home = c.account?.homeUrl;
    if (!home) throw new UserError("remote", "no calendar home on this server");
    const res: DAVResponse[] = await c.propfind({
      url: home,
      props: {
        "d:displayname": {}, "ca:calendar-color": {}, "cs:getctag": {}, "d:sync-token": {},
        "d:resourcetype": {}, "c:supported-calendar-component-set": {},
      },
      depth: "1",
    });
    if (!res.some((r) => r.ok)) throw new Error(`calendar discovery failed: HTTP ${res[0]?.status ?? "no response"}`);
    const base = new URL(home.endsWith("/") ? home : `${home}/`);
    return res
      .filter((r) => r.ok && r.href && Object.keys(r.props?.resourcetype ?? {}).includes("calendar"))
      .filter((r) => componentNames(r.props?.supportedCalendarComponentSet?.comp).includes("VEVENT"))
      .map((r) => {
        const url = new URL(r.href!, base).href;
        const displayName = text(r.props?.displayname);
        const color = text(r.props?.calendarColor);
        return {
          remoteId: url,
          name: displayName || decodeURIComponent(url.replace(/\/$/, "").split("/").pop() ?? "Calendar"),
          color,
          ctag: text(r.props?.getctag) ?? text(r.props?.syncToken),
          // Nextcloud shares read-only calendars with this privilege missing; we let the family decide too.
          readOnly: false,
        };
      });
  });
}

const asCalendar = (remoteId: string): DAVCalendar => ({ url: remoteId });

/** Every event in [from, to), recurring series expanded, with each object's address and version. */
export async function fetchEvents(a: CalDavAccount, remoteId: string, window: { from: Date; to: Date }): Promise<RemoteEvent[]> {
  const objects = await caldav(a, (c) =>
    c.fetchCalendarObjects({ calendar: asCalendar(remoteId), timeRange: { start: window.from.toISOString(), end: window.to.toISOString() } }),
  );
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
  await caldav(a, async (c) =>
    check(await c.createCalendarObject({ calendar: asCalendar(remoteId), filename: `${e.uid}.ics`, iCalString: buildEventIcs(e) }), "create"),
  );
}

/**
 * Updates in place: reads the event as the server has it and changes only
 * what Kindo edits, so a description, alarms or attendees set elsewhere
 * survive. The etag Kindo last saw makes it fail rather than overwrite
 * someone else's newer change.
 */
export async function updateEvent(a: CalDavAccount, remoteId: string, href: string, etag: string | undefined, e: EventToWrite) {
  await caldav(a, async (c) => {
    const [current] = await c.fetchCalendarObjects({ calendar: asCalendar(remoteId), objectUrls: [href], urlFilter: () => true });
    if (typeof current?.data !== "string" || !current.data.includes("BEGIN:VEVENT")) throw new UserError("conflict", "update: the event is gone from the server");
    let data: string;
    try {
      data = updateEventIcs(current.data, e);
    } catch (err) {
      throw new UserError("remote", `update: ${errorMessage(err)}`);
    }
    await check(await c.updateCalendarObject({ calendarObject: { url: href, etag: etag ?? current.etag, data } }), "update");
  });
}

export async function deleteEvent(a: CalDavAccount, href: string, etag: string | undefined) {
  await caldav(a, async (c) => check(await c.deleteCalendarObject({ calendarObject: { url: href, etag } }), "delete"));
}
