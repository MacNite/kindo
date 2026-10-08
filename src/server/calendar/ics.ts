import type { Connection } from "@prisma/client";
import { decryptSecret } from "../crypto";
import { fetchText, normaliseFeedUrl } from "../http";
import { parseCalendar } from "./ical";
import type { CalendarProvider } from "./sync";

/**
 * ICS subscriptions (§5, §19.8): read-only feeds like a school calendar or the
 * waste collection. The feed URL is often private (it is the password), so it
 * is stored encrypted like any other secret.
 */
export const ICS_REMOTE_ID = "feed";
export const feedUrl = (c: Connection) => normaliseFeedUrl(c.secret ? decryptSecret(c.secret) : "");

/** Fetches and checks a feed: it must be a calendar. */
export async function readFeed(url: string) {
  const text = await fetchText(normaliseFeedUrl(url), { maxBytes: 10 * 1024 * 1024, headers: { Accept: "text/calendar, */*" } });
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("not an iCalendar feed");
  return text;
}

export const icsProvider: CalendarProvider = {
  // One calendar per feed. No change marker in the listing: the sync compares what it fetched (syncSource).
  listCalendars: async (c) => [{ remoteId: ICS_REMOTE_ID, name: c.name, readOnly: true }],
  fetchEvents: async (c, _s, window) => {
    const text = await readFeed(feedUrl(c));
    return parseCalendar(text, window).map((e) => ({ ...e, href: "" }));
  },
};
