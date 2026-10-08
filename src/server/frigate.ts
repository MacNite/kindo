import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import type { Duplex } from "node:stream";
import type { Connection } from "@prisma/client";
import { STREAM_NAME, type CameraSetup } from "@/lib/cameras";
import { decryptSecret } from "./crypto";
import { UserError } from "./errors";

/**
 * Frigate (§22, §20 D48): its cameras' still pictures, the list of cameras and
 * go2rtc streams, and the WebRTC handshake for live view and talking. Kindo
 * signs in on the server with a Frigate user and keeps the token there; the
 * browser only ever talks to Kindo, and to go2rtc's media port for the video
 * itself.
 *
 * Frigate's authenticated port (8971 in the container) serves a self-signed
 * certificate unless the household set up its own. Rather than switching
 * certificate checks off, the admin can trust the one certificate Frigate
 * shows when it is connected: its SHA-256 fingerprint is pinned, and every
 * later connection must present exactly that certificate before anything,
 * the password included, is sent.
 */

/** Non-secret settings stored on the connection (`Connection.config`). */
export interface FrigateStoredConfig {
  /** SHA-256 fingerprint of Frigate's own certificate, when the admin trusted it. */
  fingerprint?: string;
  cameras?: CameraSetup[];
}

export interface FrigateTarget {
  url: string;
  username: string;
  password: string;
  fingerprint?: string;
}

export function frigateTarget(c: Pick<Connection, "url" | "username" | "secret" | "config">): FrigateTarget {
  const cfg = (c.config ?? {}) as FrigateStoredConfig;
  return { url: c.url ?? "", username: c.username ?? "", password: c.secret ? decryptSecret(c.secret) : "", fingerprint: cfg.fingerprint };
}

export const frigateCameras = (c: Pick<Connection, "config"> | null | undefined): CameraSetup[] => ((c?.config ?? {}) as FrigateStoredConfig).cameras ?? [];

// ── HTTP with an optional pinned certificate ─────────────────────────────────
interface Res { status: number; headers: IncomingHttpHeaders; body: Buffer }
interface Req { method?: string; headers?: Record<string, string>; body?: string | Buffer; timeoutMs?: number; maxBytes?: number }

const normalisePrint = (f: string) => f.trim().toUpperCase().replace(/[^0-9A-F]/g, "").replace(/(..)(?!$)/g, "$1:");

function portOf(u: URL) {
  return Number(u.port || (u.protocol === "https:" ? 443 : 80));
}

/** What a connection error means for someone setting Frigate up behind a reverse proxy or in Docker. */
function explain(code: string, u: URL): string {
  if (/SELF_SIGNED|UNABLE_TO_VERIFY|CERT_/.test(code)) return `the certificate isn't trusted (${code}); connect again and trust Frigate's own certificate`;
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID") return `the certificate is for another name (${code})`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `the Kindo server can't resolve ${u.hostname} (${code}); its container needs a DNS server that knows this name`;
  if (code === "ECONNREFUSED") return `nothing answers on port ${portOf(u)} (${code})`;
  if (code === "ETIMEDOUT" || code === "EHOSTUNREACH" || code === "ENETUNREACH" || code === "timed out")
    return `no answer from the Kindo server (${code}); a firewall, or a name that points to the public address from inside the house`;
  if (/EPROTO|WRONG_VERSION_NUMBER/.test(code)) return `this port doesn't speak https (${code}); try http:// or Frigate's https port 8971`;
  return code;
}

/** A redirect from Frigate's address: usually a sign-in proxy (authentik, Authelia) in front of it. */
function redirected(res: Res): UserError | null {
  if (res.status < 300 || res.status >= 400) return null;
  const to = String(res.headers.location ?? "");
  let where = to;
  try {
    where = new URL(to, "http://x").host || to;
  } catch {}
  return new UserError("remote", `Frigate's address redirects (HTTP ${res.status}${where ? ` to ${where}` : ""}). If a sign-in proxy is in front of Frigate, let /api through to Frigate or point Kindo at Frigate's own port 8971`);
}

/**
 * Opens the connection to Frigate. For https with a pinned fingerprint the
 * certificate is compared before the socket is handed over, so a wrong server
 * never sees the request.
 */
function openSocket(u: URL, fingerprint: string | undefined, timeoutMs: number): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const fail = (e: Error) => {
      socket.destroy();
      reject(new UserError("remote", `${u.host}: ${explain((e as NodeJS.ErrnoException).code ?? e.message, u)}`));
    };
    const timer = setTimeout(() => fail(new Error("timed out")), timeoutMs);
    const done = () => clearTimeout(timer);
    let socket: Duplex;
    if (u.protocol === "https:") {
      const tls = tlsConnect({ host, port: portOf(u), servername: /^[\d.:]+$/.test(host) ? undefined : host, rejectUnauthorized: !fingerprint });
      socket = tls;
      tls.once("secureConnect", () => {
        done();
        if (fingerprint && normalisePrint(tls.getPeerCertificate().fingerprint256 ?? "") !== normalisePrint(fingerprint)) {
          tls.destroy();
          return reject(new UserError("remote", `${u.host}: the certificate changed since Frigate was connected`));
        }
        resolve(tls);
      });
    } else {
      socket = netConnect({ host, port: portOf(u) });
      socket.once("connect", () => {
        done();
        resolve(socket);
      });
    }
    socket.once("error", (e) => {
      done();
      fail(e);
    });
  });
}

/** One request to Frigate: a fixed path on the configured address, bounded in time and size, no redirects. */
export async function frigateRequest(t: Pick<FrigateTarget, "url" | "fingerprint">, path: string, { method = "GET", headers = {}, body, timeoutMs = 10_000, maxBytes = 2 * 1024 * 1024 }: Req = {}): Promise<Res> {
  let u: URL;
  try {
    u = new URL(path, t.url.replace(/\/*$/, "/"));
  } catch {
    throw new UserError("invalid", "not a URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UserError("invalid", "http(s) only");
  const socket = await openSocket(u, u.protocol === "https:" ? t.fingerprint : undefined, timeoutMs);
  return new Promise<Res>((resolve, reject) => {
    const req = httpRequest({
      method, host: u.hostname, port: portOf(u), path: `${u.pathname}${u.search}`,
      headers: { ...headers, ...(body !== undefined ? { "content-length": String(Buffer.byteLength(body)) } : {}) },
      createConnection: () => socket as never,
    });
    const timer = setTimeout(() => req.destroy(new Error("timed out")), timeoutMs);
    req.on("response", (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) req.destroy(new Error("response too large"));
        else chunks.push(c);
      });
      res.on("end", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
      });
    });
    req.on("error", (e) => {
      clearTimeout(timer);
      socket.destroy();
      reject(new UserError("remote", `${u.host}: ${e.message}`));
    });
    req.end(body);
  });
}

/**
 * The certificate Frigate presents, for the admin to trust when connecting.
 * `trusted` is whether the system's certificate authorities vouch for it already.
 */
export function probeCertificate(url: string, timeoutMs = 10_000): Promise<{ fingerprint: string; trusted: boolean }> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const tls = tlsConnect({ host, port: portOf(u), servername: /^[\d.:]+$/.test(host) ? undefined : host, rejectUnauthorized: false });
    const timer = setTimeout(() => tls.destroy(new Error("timed out")), timeoutMs);
    tls.once("secureConnect", () => {
      clearTimeout(timer);
      const fingerprint = tls.getPeerCertificate().fingerprint256 ?? "";
      const trusted = tls.authorized;
      tls.destroy();
      resolve({ fingerprint, trusted });
    });
    tls.once("error", (e) => {
      clearTimeout(timer);
      reject(new UserError("remote", `${u.host}: ${explain((e as NodeJS.ErrnoException).code ?? e.message, u)}`));
    });
  });
}

// ── Signing in ───────────────────────────────────────────────────────────────
/** Frigate's tokens, per address and user, in memory only. Empty: Frigate has authentication off. */
const g = globalThis as unknown as { kindoFrigateTokens?: Map<string, { token: string; at: number }> };
const tokens = (g.kindoFrigateTokens ??= new Map());
/** Signs in again after this long, well inside Frigate's default 24 h session. */
const TOKEN_MAX_AGE_MS = 6 * 3600_000;
const tokenKey = (t: FrigateTarget) => `${t.url}|${t.username}|${t.fingerprint ?? ""}`;

/** Frigate puts the JWT in a cookie (named `frigate_token` unless configured otherwise). */
function tokenFrom(headers: IncomingHttpHeaders): string | null {
  for (const c of [headers["set-cookie"] ?? []].flat()) {
    const value = c.split(";")[0]?.split("=").slice(1).join("=") ?? "";
    if (value.split(".").length === 3) return value;
  }
  return null;
}

async function login(t: FrigateTarget): Promise<string> {
  // Frigate's unauthenticated port (5000), or authentication off: nothing to sign in with.
  if (!t.username) return "";
  const res = await frigateRequest(t, "api/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: t.username, password: t.password }),
  });
  const moved = redirected(res);
  if (moved) throw moved;
  // Port 5000, or authentication switched off: nothing to sign in to.
  if (res.status === 404) return "";
  if (res.status === 401 || res.status === 400) throw new UserError("remote", "Frigate refused the username or password");
  if (res.status === 429) throw new UserError("remote", "Frigate is rate-limiting sign-ins; try again in a minute");
  if (res.status !== 200) throw new UserError("remote", `Frigate: HTTP ${res.status} when signing in`);
  const token = tokenFrom(res.headers);
  if (!token) throw new UserError("remote", "Frigate sent no token");
  return token;
}

async function token(t: FrigateTarget, fresh = false): Promise<string> {
  const key = tokenKey(t);
  const hit = tokens.get(key);
  if (!fresh && hit && Date.now() - hit.at < TOKEN_MAX_AGE_MS) return hit.token;
  const value = await login(t);
  tokens.set(key, { token: value, at: Date.now() });
  return value;
}

/** A request with Frigate's token, signing in again once if the token has expired. */
async function authed(t: FrigateTarget, path: string, req: Req = {}): Promise<Res> {
  for (const fresh of [false, true]) {
    const tk = await token(t, fresh);
    const res = await frigateRequest(t, path, { ...req, headers: { ...req.headers, ...(tk ? { authorization: `Bearer ${tk}` } : {}) } });
    if (res.status !== 401 || fresh) return res;
  }
  throw new UserError("remote", "Frigate refused the token");
}

/** Forgets a connection's token, e.g. when it is removed. */
export const forgetToken = (t: FrigateTarget) => tokens.delete(tokenKey(t));

// ── What Frigate has ─────────────────────────────────────────────────────────
/**
 * Frigate's cameras and go2rtc's streams, by name only. The stream URLs in
 * Frigate's config carry the cameras' passwords; they are never read out.
 */
export async function listFrigate(t: FrigateTarget): Promise<{ cameras: string[]; streams: string[] }> {
  // The full config of a household with many cameras is large.
  const res = await authed(t, "api/config", { maxBytes: 32 * 1024 * 1024, timeoutMs: 20_000 });
  const moved = redirected(res);
  if (moved) throw moved;
  if (res.status === 404) throw new UserError("remote", `no Frigate API at ${t.url} (HTTP 404); is this Frigate's address, with the right port?`);
  if (res.status === 401 || res.status === 403) throw new UserError("remote", `Frigate refused access (HTTP ${res.status}); check the user, or a proxy in front of Frigate`);
  if (res.status !== 200) throw new UserError("remote", `Frigate: HTTP ${res.status}`);
  let cfg: { cameras?: Record<string, unknown>; go2rtc?: { streams?: Record<string, unknown> } };
  try {
    cfg = JSON.parse(res.body.toString("utf8"));
  } catch {
    throw new UserError("remote", `${t.url} answered, but not like Frigate (a web page instead of Frigate's API: a proxy's page, or another service)`);
  }
  if (!cfg || typeof cfg.cameras !== "object") throw new UserError("remote", "this doesn't look like Frigate");
  const names = (o: object | undefined) => Object.keys(o ?? {}).filter((n) => STREAM_NAME.test(n)).sort();
  return { cameras: names(cfg.cameras ?? {}), streams: names(cfg.go2rtc?.streams) };
}

/** The camera's latest picture, scaled to `height` pixels. */
export async function snapshot(t: FrigateTarget, camera: string, height = 480): Promise<{ type: string; body: Buffer }> {
  if (!STREAM_NAME.test(camera)) throw new UserError("invalid", "camera name");
  const res = await authed(t, `api/${encodeURIComponent(camera)}/latest.jpg?height=${Math.round(height)}`, { maxBytes: 5 * 1024 * 1024 });
  if (res.status === 404) throw new UserError("notFound", "camera");
  const type = String(res.headers["content-type"] ?? "");
  if (res.status !== 200 || !type.startsWith("image/")) throw new UserError("remote", `Frigate: HTTP ${res.status}`);
  return { type, body: res.body };
}

/**
 * The WebRTC handshake with go2rtc, through Frigate's authenticated proxy
 * (`/api/go2rtc/webrtc`): the browser's offer in, go2rtc's complete answer
 * (with its candidates) out. One request, no WebSocket to keep open. The
 * stream name comes from the admin's setup, never from the browser.
 */
export async function exchangeSdp(t: FrigateTarget, stream: string, offer: string): Promise<string> {
  if (!STREAM_NAME.test(stream)) throw new UserError("invalid", "stream name");
  const res = await authed(t, `api/go2rtc/webrtc?src=${encodeURIComponent(stream)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "offer", sdp: offer }),
    // go2rtc answers once it has gathered its candidates and reached the camera.
    timeoutMs: 20_000, maxBytes: 256 * 1024,
  });
  if (res.status === 404) throw new UserError("notFound", "stream");
  if (res.status !== 200 && res.status !== 201) throw new UserError("remote", `go2rtc: HTTP ${res.status}`);
  let answer: { type?: string; sdp?: string };
  try {
    answer = JSON.parse(res.body.toString("utf8"));
  } catch {
    throw new UserError("remote", "go2rtc sent no answer");
  }
  if (answer.type !== "answer" || typeof answer.sdp !== "string" || !answer.sdp.startsWith("v=0")) throw new UserError("remote", "go2rtc sent no answer");
  return answer.sdp;
}
