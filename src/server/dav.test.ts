import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listCalendars, fetchEvents } from "./calendar/caldav";
import { DavRefused, retryAfter } from "./dav";

/**
 * A small Nextcloud: service discovery, one principal, a calendar home with
 * two calendars. It counts what Kindo asks, and can refuse like Nextcloud's
 * brute-force protection does (D60).
 */
const ms = (body: string) => `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">${body}</d:multistatus>`;
const calendar = (name: string) => `<d:response><d:href>/remote.php/dav/calendars/anna/${name}/</d:href><d:propstat><d:prop>
  <d:displayname>${name}</d:displayname><cs:getctag>1</cs:getctag>
  <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
  <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
const event = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:swim\r\nDTSTART:20261012T150000Z\r\nDTEND:20261012T160000Z\r\nSUMMARY:Swimming\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

let server: Server;
let base = "";
let requests: string[] = [];
let refuse: { status: number; retryAfter?: string } | undefined;
const PASS = "app-password";

function reply(req: IncomingMessage, res: ServerResponse, body: string) {
  requests.push(`${req.method} ${req.url}`);
  if (refuse) {
    res.writeHead(refuse.status, { ...(refuse.retryAfter ? { "Retry-After": refuse.retryAfter } : {}), ...(refuse.status === 401 ? { "WWW-Authenticate": 'Basic realm="Nextcloud"' } : {}) });
    return res.end();
  }
  if (req.url?.startsWith("/.well-known/")) {
    res.writeHead(301, { Location: "/remote.php/dav/" });
    return res.end();
  }
  if (req.headers.authorization !== `Basic ${Buffer.from(`anna:${PASS}`).toString("base64")}`) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Nextcloud"' });
    return res.end();
  }
  const url = req.url ?? "";
  let out = "";
  if (url === "/remote.php/dav/") out = ms(`<d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/anna/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`);
  else if (url.startsWith("/remote.php/dav/principals/")) out = ms(`<d:response><d:href>/remote.php/dav/principals/users/anna/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>/remote.php/dav/calendars/anna/</d:href></c:calendar-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`);
  else if (url === "/remote.php/dav/calendars/anna/") out = ms(`<d:response><d:href>/remote.php/dav/calendars/anna/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>${calendar("family")}${calendar("school")}`);
  else if (url.startsWith("/remote.php/dav/calendars/anna/family/"))
    out = ms(`<d:response><d:href>/remote.php/dav/calendars/anna/family/swim.ics</d:href><d:propstat><d:prop><d:getetag>"1"</d:getetag>${body.includes("calendar-multiget") ? `<c:calendar-data>${event}</c:calendar-data>` : ""}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`);
  else {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(207, { "Content-Type": "application/xml; charset=utf-8" });
  res.end(out);
}

describe("CalDAV sessions (D60)", () => {
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => reply(req, res, body));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    requests = [];
    refuse = undefined;
  });

  // Each test uses its own username or URL path, so no login is reused across tests.
  const account = (path: string, password = PASS) => ({ url: `${base}/remote.php/dav/?t=${path}`, username: "anna", password });

  it("logs in once and asks for the calendars in one request, then reuses the login", async () => {
    const a = account("reuse");
    const cals = await listCalendars(a);
    expect(cals.map((c) => c.name)).toEqual(["family", "school"]);
    const afterFirst = requests.length;
    // Discovery (well-known, principal, home) and one PROPFIND for the list: no request per calendar.
    expect(afterFirst).toBeLessThanOrEqual(4);

    const family = cals.find((c) => c.name === "family")!;
    const events = await fetchEvents(a, family.remoteId, { from: new Date("2026-10-01"), to: new Date("2026-11-01") });
    expect(events.map((e) => e.summary)).toEqual(["Swimming"]);
    await listCalendars(a);
    // No second discovery: only the calendar query, the multiget and the second listing.
    expect(requests.slice(afterFirst).filter((r) => r.includes("well-known") || r.includes("principals"))).toEqual([]);
    expect(requests.length - afterFirst).toBe(3);
  });

  it("stops after the first refused login instead of trying other addresses", async () => {
    const err = await listCalendars(account("wrong", "wrong")).catch((e) => e);
    expect(err).toBeInstanceOf(DavRefused);
    expect(err).toMatchObject({ status: 401, code: "remote" });
    expect(requests.filter((r) => !r.includes("well-known"))).toHaveLength(1);
  });

  it("stops at a 429 and passes on how long the server asks to wait", async () => {
    refuse = { status: 429, retryAfter: "120" };
    const before = Date.now();
    const err = await listCalendars(account("busy")).catch((e) => e);
    expect(err).toBeInstanceOf(DavRefused);
    expect(err.status).toBe(429);
    expect(err.retryAfter.getTime()).toBeGreaterThanOrEqual(before + 119_000);
    expect(requests).toHaveLength(1);
  });

  it("logs in again after a refusal, once the caller tries again", async () => {
    const a = account("again");
    await listCalendars(a);
    refuse = { status: 429 };
    await expect(listCalendars(a)).rejects.toBeInstanceOf(DavRefused);
    refuse = undefined;
    requests = [];
    expect(await listCalendars(a)).toHaveLength(2);
    expect(requests.some((r) => r.includes("principals"))).toBe(true);
  });

  it("reads Retry-After in seconds or as a date, never more than a day ahead", () => {
    const now = Date.parse("2026-10-10T06:00:00Z");
    expect(retryAfter("60", now)?.toISOString()).toBe("2026-10-10T06:01:00.000Z");
    expect(retryAfter("Sat, 10 Oct 2026 07:00:00 GMT", now)?.toISOString()).toBe("2026-10-10T07:00:00.000Z");
    expect(retryAfter("999999", now)?.toISOString()).toBe("2026-10-11T06:00:00.000Z");
    expect(retryAfter("0", now)).toBeUndefined();
    expect(retryAfter("soon", now)).toBeUndefined();
    expect(retryAfter(null, now)).toBeUndefined();
  });
});
