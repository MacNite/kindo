import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import type { PrismaClient } from "@prisma/client";
import * as C from "@/server/connections";
import { saveEvent, deleteEvent } from "@/server/household";
import { syncConnection } from "@/server/calendar/sync";
import { isPresent, watchHome } from "@/server/homeassistant";
import { seedDemo } from "@/server/demo/seed";
import { resetEnvCache } from "@/server/env";
import { TEST_DB, resetTestDatabase } from "./db";

const ics = readFileSync(new URL("./fixtures/school.ics", import.meta.url), "utf8");
const listen = (s: Server) => new Promise<string>((r) => s.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));
const readBody = (req: import("node:http").IncomingMessage) => new Promise<string>((r) => {
  let d = "";
  req.on("data", (c) => (d += c));
  req.on("end", () => r(d));
});

/** A small stand-in for Google's token and Calendar APIs. */
function googleMock() {
  const calendars = [
    { id: "family@group.calendar.google.com", summary: "Family", accessRole: "owner" },
    { id: "holidays@group.v.calendar.google.com", summary: "Holidays", accessRole: "reader" },
  ];
  const tomorrow = new Date(Date.now() + 86_400_000);
  const events: Record<string, Record<string, unknown>[]> = {
    [calendars[0].id]: [
      { id: "g1", etag: '"1"', summary: "Dentist", start: { dateTime: tomorrow.toISOString() }, end: { dateTime: new Date(tomorrow.getTime() + 3_600_000).toISOString() } },
      { id: "g2_20261009", etag: '"2"', summary: "Choir", recurringEventId: "g2", start: { dateTime: tomorrow.toISOString() }, end: { dateTime: tomorrow.toISOString() } },
      { id: "g3", status: "cancelled", start: { date: "2026-10-01" }, end: { date: "2026-10-02" } },
    ],
    [calendars[1].id]: [{ id: "h1", summary: "Unity day", start: { date: "2026-10-03" }, end: { date: "2026-10-04" } }],
  };
  const log: { method: string; path: string; body?: Record<string, unknown> }[] = [];
  let limited = false;
  /** Calendars whose events fail, like one removed on Google while Kindo still follows it. */
  const broken = new Set<string>();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const json = (b: unknown, status = 200) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(b));
    if (url.pathname === "/token") return json({ access_token: "access-1", expires_in: 3600 });
    if (req.headers.authorization !== "Bearer access-1") return json({ error: "unauthorized" }, 401);
    // One calendar per page, like an account with many: Kindo must follow nextPageToken.
    if (url.pathname === "/calendar/v3/users/me/calendarList") {
      const i = Number(url.searchParams.get("pageToken") ?? 0);
      return json({ items: [calendars[i]], ...(i + 1 < calendars.length ? { nextPageToken: String(i + 1) } : {}) });
    }
    if (limited) return json({ error: { code: 403, errors: [{ reason: "rateLimitExceeded" }], message: "Rate Limit Exceeded" } }, 403);
    const m = url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (m) {
      const cal = decodeURIComponent(m[1]);
      const body = req.method === "POST" || req.method === "PATCH" ? JSON.parse(await readBody(req)) : undefined;
      log.push({ method: req.method!, path: url.pathname, body });
      if (broken.has(cal)) return json({ error: { code: 500, message: "Backend Error" } }, 500);
      if (req.method === "GET") return json({ items: events[cal] ?? [] });
      if (req.method === "POST") {
        const e = { id: `new${log.length}`, etag: '"n"', ...body };
        events[cal].push(e);
        return json(e);
      }
      if (req.method === "PATCH") {
        // Like Google: nested objects merge, null clears a field.
        const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
          const out = { ...a };
          for (const [k, v] of Object.entries(b)) {
            if (v === null) delete out[k];
            else if (typeof v === "object" && !Array.isArray(v) && typeof a[k] === "object") out[k] = merge(a[k] as Record<string, unknown>, v as Record<string, unknown>);
            else out[k] = v;
          }
          return out;
        };
        events[cal] = events[cal].map((e) => (e.id === m[2] ? { ...merge(e, body), etag: `"${log.length}"` } : e));
        return json({});
      }
      if (req.method === "DELETE") {
        events[cal] = events[cal].filter((e) => e.id !== m[2]);
        return res.writeHead(204).end();
      }
    }
    json({ error: "not found" }, 404);
  });
  return { server, log, events, broken, limit: (on: boolean) => void (limited = on) };
}

describe.skipIf(!TEST_DB)("ICS subscriptions and Google Calendar (§19.8)", () => {
  let db: PrismaClient;
  let feed: Server;
  let feedUrl = "";
  const google = googleMock();

  beforeAll(async () => {
    db = await resetTestDatabase();
    await db.$transaction((tx) => seedDemo(tx), { timeout: 60_000 });
    let flaky = 0;
    feed = createServer((req, res) => {
      // Answers once, then fails: the check passes and the first sync fails.
      if (req.url === "/flaky.ics") return flaky++ ? res.writeHead(500).end() : res.writeHead(200, { "content-type": "text/calendar" }).end(ics);
      return req.url === "/school.ics" ? res.writeHead(200, { "content-type": "text/calendar" }).end(ics) : res.writeHead(200).end("<html>not a calendar</html>");
    });
    feedUrl = await listen(feed);
    const base = await listen(google.server);
    process.env.GOOGLE_API_BASE = base;
    process.env.GOOGLE_OAUTH_BASE = base;
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    resetEnvCache(); // the configuration is read once
  }, 60_000);
  afterAll(async () => {
    feed?.close();
    google.server.close();
    await db?.$disconnect();
  });

  it("subscribes to a feed: read-only, its people's colours, the address kept secret", async () => {
    await expect(C.addIcs(db, { name: "Nope", url: `${feedUrl}/page.html`, defaultMemberIds: [], background: false })).rejects.toMatchObject({ code: "remote" });
    // A first sync that fails leaves nothing behind, so trying again doesn't add a second feed.
    await expect(C.addIcs(db, { name: "Flaky", url: `${feedUrl}/flaky.ics`, defaultMemberIds: [], background: false })).rejects.toMatchObject({ code: "remote" });
    expect(await db.connection.count({ where: { kind: "ics" } })).toBe(0);
    expect(await db.calendarSource.count({ where: { provider: "ics", connectionId: { not: null } } })).toBe(0);
    const id = await C.addIcs(db, { name: "School", url: `${feedUrl}/school.ics`, defaultMemberIds: ["lena"], background: true });
    const conn = await db.connection.findUniqueOrThrow({ where: { id }, include: { sources: { include: { events: true } } } });
    expect(conn.secret).not.toContain("school.ics");
    const [source] = conn.sources;
    expect(source).toMatchObject({ readOnly: true, background: true, defaultMemberIds: ["lena"] });
    const autumn = source.events.find((e) => e.title === "Herbstferien");
    expect(autumn).toMatchObject({ memberIds: ["lena"], background: true, allDay: true });
    // Kindo's own member assignment in the feed wins over the calendar's people.
    expect(source.events.find((e) => e.title === "Football practice")?.memberIds).toEqual(["lena", "max"]);
    // The same feed again: nothing is rewritten. A change of the calendar's people is.
    expect(await syncConnection(db, conn, { force: true })).toBe(false);
    await C.updateSource(db, { id: source.id, name: "School", defaultMemberIds: ["max"], readOnly: true, background: true });
    expect(await syncConnection(db, conn, { force: true })).toBe(true);
    expect((await db.event.findFirstOrThrow({ where: { sourceId: source.id, title: { equals: "Herbstferien" } } })).memberIds).toEqual(["max"]);
  });

  it("connects a Google account: calendars, events, read-only where Google says so", async () => {
    const { id, synced } = await C.addGoogle(db, { email: "max@example.test", refreshToken: "refresh-1" });
    expect(synced).toBe(true);
    const conn = await db.connection.findUniqueOrThrow({ where: { id }, include: { sources: true } });
    expect(conn.secret).not.toContain("refresh-1");
    expect(conn.sources.map((s) => [s.remoteId, s.readOnly])).toEqual([
      ["family@group.calendar.google.com", false], ["holidays@group.v.calendar.google.com", true],
    ]);
    const family = conn.sources[0];
    const events = await db.event.findMany({ where: { sourceId: family.id }, orderBy: { title: "asc" } });
    expect(events.map((e) => [e.title, e.recurring])).toEqual([["Choir", true], ["Dentist", false]]);
    const holiday = await db.event.findFirstOrThrow({ where: { sourceId: conn.sources[1].id } });
    expect(holiday.start.toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });

  it("writes to Google: Kindo's people travel along and the event syncs back under the same id", async () => {
    const family = await db.calendarSource.findFirstOrThrow({ where: { remoteId: "family@group.calendar.google.com" } });
    const start = new Date(Date.now() + 2 * 86_400_000);
    const id = await saveEvent(db, { sourceId: family.id, title: "Football", start, end: new Date(start.getTime() + 3_600_000), allDay: false, memberIds: ["lena"] });
    const post = google.log.find((l) => l.method === "POST")!;
    expect(post.body).toMatchObject({ summary: "Football", extendedProperties: { private: { kindoMembers: "lena" } } });
    expect(await db.event.findUniqueOrThrow({ where: { id } })).toMatchObject({ title: "Football", memberIds: ["lena"] });

    // An edit sends only what changed; a moved event comes back under its new id.
    const later = new Date(start.getTime() + 86_400_000);
    const moved = await saveEvent(db, { id, sourceId: family.id, title: "Football", start: later, end: new Date(later.getTime() + 3_600_000), allDay: false, memberIds: ["lena"] });
    const patch = google.log.find((l) => l.method === "PATCH")!;
    expect(Object.keys(patch.body!).sort()).toEqual(["end", "start"]);
    expect(moved).not.toBe(id);
    expect(await db.event.findUniqueOrThrow({ where: { id: moved } })).toMatchObject({ title: "Football", memberIds: ["lena"], start: later });
    const renamed = await saveEvent(db, { id: moved, sourceId: family.id, title: "Football final", start: later, end: new Date(later.getTime() + 3_600_000), allDay: false, memberIds: ["lena", "max"] });
    expect(renamed).toBe(moved);
    expect(google.log.filter((l) => l.method === "PATCH").at(-1)!.body).toEqual({ summary: "Football final", extendedProperties: { private: { kindoMembers: "lena max" } } });
    expect(await db.event.findUniqueOrThrow({ where: { id: moved } })).toMatchObject({ title: "Football final", memberIds: ["lena", "max"] });
    await deleteEvent(db, { id: moved });
    expect(google.log.some((l) => l.method === "DELETE")).toBe(true);
    const choir = await db.event.findFirstOrThrow({ where: { title: { equals: "Choir" } } });
    await expect(deleteEvent(db, { id: choir.id })).rejects.toMatchObject({ code: "readOnly" });
  });

  it("tells Google's rate limit apart from missing write access", async () => {
    const conn = await db.connection.findFirstOrThrow({ where: { kind: "google" } });
    const family = await db.calendarSource.findFirstOrThrow({ where: { remoteId: "family@group.calendar.google.com" } });
    google.limit(true);
    try {
      await expect(syncConnection(db, conn, { force: true })).rejects.toMatchObject({ code: "remote", message: expect.stringMatching(/too many requests/) });
      const start = new Date(Date.now() + 3 * 86_400_000);
      await expect(saveEvent(db, { sourceId: family.id, title: "Swim", start, end: new Date(start.getTime() + 3_600_000), allDay: false, memberIds: [] }))
        .rejects.toMatchObject({ code: "remote" });
    } finally {
      google.limit(false);
    }
  });

  it("a failing account is marked, and the error kept for Settings", async () => {
    const conn = await db.connection.findFirstOrThrow({ where: { kind: "google" } });
    const api = process.env.GOOGLE_API_BASE;
    process.env.GOOGLE_API_BASE = "http://127.0.0.1:9"; // nothing listens there
    resetEnvCache();
    await expect(syncConnection(db, conn, { force: true })).rejects.toMatchObject({ code: "remote" });
    process.env.GOOGLE_API_BASE = api;
    resetEnvCache();
    expect((await db.connection.findUniqueOrThrow({ where: { id: conn.id } })).status).toBe("error");
  });

  it("one failing calendar doesn't hold back the account's others, and Settings learns which one", async () => {
    const conn = await db.connection.findFirstOrThrow({ where: { kind: "google" } });
    const holidays = await db.calendarSource.findFirstOrThrow({ where: { remoteId: "holidays@group.v.calendar.google.com" } });
    google.events[holidays.remoteId!].push({ id: "h2", summary: "Reformation day", start: { date: "2026-10-31" }, end: { date: "2026-11-01" } });
    google.broken.add("family@group.calendar.google.com");
    try {
      await expect(syncConnection(db, conn, { force: true })).rejects.toMatchObject({ code: "remote" });
    } finally {
      google.broken.clear();
    }
    expect(await db.event.count({ where: { sourceId: holidays.id, title: { equals: "Reformation day" } } })).toBe(1);
    const stored = await db.connection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(stored.status).toBe("error");
    expect(stored.lastError).toMatch(/^Family: /);
    await syncConnection(db, conn, { force: true });
    expect((await db.connection.findUniqueOrThrow({ where: { id: conn.id } })).status).toBe("ok");
  });

  it("a Google account whose first sync fails is kept, and says the events didn't come", async () => {
    google.limit(true);
    try {
      const { id, synced } = await C.addGoogle(db, { email: "lena@example.test", refreshToken: "refresh-2" });
      expect(synced).toBe(false);
      expect(await db.connection.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "error", lastError: expect.stringMatching(/too many requests/) });
      await db.connection.delete({ where: { id } });
    } finally {
      google.limit(false);
    }
  });
});

describe("Home Assistant presence (§19.8)", () => {
  it("knows which states mean someone is there", () => {
    expect(["on", "home", "Detected", "occupied"].every((s) => isPresent(s))).toBe(true);
    expect(["off", "not_home", "clear", "unavailable"].some((s) => isPresent(s))).toBe(false);
  });

  it("follows one entity over the WebSocket API, reporting only changes", async () => {
    const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise((r) => wss.once("listening", r));
    const port = (wss.address() as AddressInfo).port;
    let send: ((state: string) => void) | undefined;
    wss.on("connection", (ws) => {
      // Garbage first: the watcher skips it and carries on.
      ws.send("not json {");
      ws.send("null");
      ws.send(JSON.stringify({ type: "auth_required" }));
      ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type === "auth") ws.send(JSON.stringify({ type: msg.access_token === "token" ? "auth_ok" : "auth_invalid" }));
        if (msg.type === "get_states") ws.send(JSON.stringify({ id: msg.id, type: "result", success: true, result: [{ entity_id: "binary_sensor.hall", state: "off" }] }));
        if (msg.type === "subscribe_trigger") {
          send = (state) => ws.send(JSON.stringify({ id: msg.id, type: "event", event: { variables: { trigger: { to_state: { state } } } } }));
        }
      });
    });
    const seen: boolean[] = [];
    const statuses: boolean[] = [];
    const stop = watchHome({ url: `http://127.0.0.1:${port}`, token: "token", entityId: "binary_sensor.hall", presentStates: ["on"], controls: [] },
      { onPresence: (p) => seen.push(p), onControls: () => {}, onStatus: (ok) => statuses.push(ok) });
    await expect.poll(() => send !== undefined).toBe(true);
    send!("on");
    send!("on");
    send!("off");
    await expect.poll(() => seen).toEqual([false, true, false]);
    expect(statuses[0]).toBe(true);
    stop();
    wss.close();
  });

  it("tells switch changes apart from presence, and follows switches without a presence entity (§21)", async () => {
    const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise((r) => wss.once("listening", r));
    const port = (wss.address() as AddressInfo).port;
    const subscribed: unknown[] = [];
    let send: (() => void) | undefined;
    wss.on("connection", (ws) => {
      ws.send(JSON.stringify({ type: "auth_required" }));
      ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type === "auth") ws.send(JSON.stringify({ type: "auth_ok" }));
        if (msg.type === "subscribe_trigger") {
          subscribed.push(msg.trigger.entity_id);
          send = () => ws.send(JSON.stringify({ id: msg.id, type: "event", event: { variables: { trigger: { to_state: { state: "on" } } } } }));
        }
      });
    });
    const presence: boolean[] = [];
    let controls = 0;
    const stop = watchHome({ url: `http://127.0.0.1:${port}`, token: "token", entityId: "", presentStates: ["on"], controls: [{ entityId: "light.kitchen", name: "Kitchen" }] },
      { onPresence: (p) => presence.push(p), onControls: () => controls++, onStatus: () => {} });
    await expect.poll(() => send !== undefined).toBe(true);
    expect(subscribed).toEqual([["light.kitchen"]]);
    send!();
    await expect.poll(() => controls).toBe(1);
    expect(presence).toEqual([]);
    stop();
    wss.close();
  });

  it("gives up on a refused token instead of hammering Home Assistant", async () => {
    const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise((r) => wss.once("listening", r));
    let connections = 0;
    wss.on("connection", (ws) => {
      connections++;
      ws.send(JSON.stringify({ type: "auth_required" }));
      ws.on("message", () => ws.send(JSON.stringify({ type: "auth_invalid" })));
    });
    const statuses: (string | undefined)[] = [];
    const stop = watchHome({ url: `http://127.0.0.1:${(wss.address() as AddressInfo).port}`, token: "wrong", entityId: "x.y", presentStates: ["on"], controls: [] },
      { onPresence: () => {}, onControls: () => {}, onStatus: (_ok, e) => statuses.push(e) });
    await expect.poll(() => statuses).toContain("Home Assistant refused the token");
    await new Promise((r) => setTimeout(r, 1500));
    expect(connections).toBe(1);
    stop();
    wss.close();
  });
});
