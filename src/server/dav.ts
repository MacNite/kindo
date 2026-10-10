import { DAVClient } from "tsdav";
import { sha256 } from "./crypto";
import { UserError } from "./errors";
import { errorMessage } from "./log";
import { timedFetch } from "./http";

/**
 * Sessions with a CalDAV or CardDAV server (Nextcloud; §19.5, D46, D60).
 *
 * Kindo often shares its public IP with the family's phones, and Nextcloud
 * throttles a whole IP after failed logins (HTTP 429). So Kindo asks the
 * server as little as it can: a login (service discovery) is kept and reused
 * for half an hour instead of repeated for every calendar, and once the
 * server refuses (401: wrong credentials, 429: too many requests) the session
 * sends nothing more, and the caller gets a `DavRefused` to back off with.
 */
export interface DavAccount { url: string; username: string; password: string }
type DavType = "caldav" | "carddav";

/** The server turned Kindo away: wrong credentials (401) or too many requests (429, maybe with a time to wait). */
export class DavRefused extends UserError {
  constructor(readonly status: 401 | 429, readonly retryAfter?: Date) {
    super("remote", status === 401 ? "wrong username or app password" : `the server is refusing requests for now (HTTP 429 Too Many Requests)`);
  }
}

const MAX_RETRY_AFTER_MS = 24 * 3_600_000;

/** A Retry-After header (seconds or an HTTP date) as a time, at most a day ahead. */
export function retryAfter(header: string | null, now = Date.now()): Date | undefined {
  if (!header?.trim()) return undefined;
  const seconds = Number(header);
  const at = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(header);
  return Number.isFinite(at) && at > now ? new Date(Math.min(at, now + MAX_RETRY_AFTER_MS)) : undefined;
}

interface Guard { refused?: DavRefused }

/**
 * A 401 that only asks for Digest is the start of a handshake tsdav answers
 * itself; one after Kindo sent Digest (and not because the nonce went stale)
 * is a refusal like any other.
 */
function refusedLogin(res: Response, init?: RequestInit) {
  const challenge = res.headers.get("www-authenticate") ?? "";
  if (!/digest/i.test(challenge)) return true;
  const sentDigest = /^digest\s/i.test(new Headers(init?.headers).get("authorization") ?? "");
  return sentDigest && !/stale\s*=\s*"?true/i.test(challenge);
}

/** `fetch` for one session: after the server refused once, no further request leaves Kindo. */
function guardedFetch(guard: Guard): typeof fetch {
  const send = timedFetch();
  return async (input, init) => {
    if (guard.refused) throw guard.refused;
    const res = await send(input, init);
    if (res.status === 429) guard.refused ??= new DavRefused(429, retryAfter(res.headers.get("retry-after")));
    else if (res.status === 401 && refusedLogin(res, init)) guard.refused ??= new DavRefused(401);
    return res;
  };
}

interface Session { client: DAVClient; guard: Guard; openedAt: number }
const SESSION_MS = 30 * 60_000;
const g = globalThis as unknown as { kindoDav?: Map<string, Promise<Session>> };
const sessions = (g.kindoDav ??= new Map<string, Promise<Session>>());

/** What a failed call means: the server's refusal if it refused, the error otherwise. */
const failure = (e: unknown, guard: Guard) => guard.refused ?? e;

async function open(a: DavAccount, type: DavType): Promise<Session> {
  const guard: Guard = {};
  const client = new DAVClient({
    serverUrl: a.url,
    credentials: { username: a.username, password: a.password },
    authMethod: "Basic",
    defaultAccountType: type,
    fetch: guardedFetch(guard),
  });
  try {
    await client.login();
  } catch (e) {
    const err = failure(e, guard);
    if (err instanceof UserError) throw err;
    const msg = errorMessage(err);
    throw new UserError("remote", /401|unauthori[sz]ed/i.test(msg) ? "wrong username or app password" : msg);
  }
  return { client, guard, openedAt: Date.now() };
}

function forget(key: string, session: Promise<Session>) {
  if (sessions.get(key) === session) sessions.delete(key);
}

/**
 * Runs `work` with a logged-in client for this account, reusing the last
 * login while it is fresh. A refusal ends the session: the next call logs in
 * again, which is the caller's to hold back.
 */
export async function withDav<T>(a: DavAccount, type: DavType, work: (client: DAVClient) => Promise<T>): Promise<T> {
  const key = sha256(`${type}\n${a.url}\n${a.username}\n${a.password}`);
  // Logins of accounts that are gone or changed don't pile up.
  for (const [k, s] of sessions) void s.then((x) => Date.now() - x.openedAt > SESSION_MS && forget(k, s), () => {});
  let pending = sessions.get(key);
  if (!pending) {
    pending = open(a, type);
    sessions.set(key, pending);
  }
  let session: Session;
  try {
    session = await pending;
  } catch (e) {
    forget(key, pending);
    throw e;
  }
  if (Date.now() - session.openedAt > SESSION_MS) {
    forget(key, pending);
    return withDav(a, type, work);
  }
  try {
    return await work(session.client);
  } catch (e) {
    throw failure(e, session.guard);
  } finally {
    if (session.guard.refused) forget(key, pending);
  }
}
