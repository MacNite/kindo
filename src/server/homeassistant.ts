import type { Connection } from "@prisma/client";
import type { Tx } from "./db";
import { decryptSecret } from "./crypto";
import { UserError } from "./errors";
import { fetchChecked } from "./http";
import { errorMessage, log } from "./log";
import { notify } from "./realtime";

/**
 * Home Assistant presence (§13, §19.8, §20 D39): someone in the hallway wakes
 * the wall from the photo frame, nobody there lets it go back to photos.
 * Kindo subscribes to one entity over Home Assistant's WebSocket API with a
 * long-lived token, on the server only.
 */
export interface HaConfig { url: string; token: string; entityId: string; presentStates: string[] }
/** States that mean "someone is here", for motion/occupancy sensors, person and device trackers. */
export const DEFAULT_PRESENT = ["on", "home", "detected", "occupied"];

export const isPresent = (state: string, present = DEFAULT_PRESENT) => present.includes(state.toLowerCase());

/** Checks the token and the entity, returning its current state. */
export async function readEntity(url: string, token: string, entityId: string): Promise<string> {
  const res = await fetchChecked(`${url.replace(/\/+$/, "")}/api/states/${encodeURIComponent(entityId)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new UserError("remote", "Home Assistant refused the token");
  if (res.status === 404) throw new UserError("remote", `no entity ${entityId}`);
  if (!res.ok) throw new UserError("remote", `Home Assistant: HTTP ${res.status}`);
  return ((await res.json()) as { state: string }).state;
}

const wsUrl = (url: string) => `${url.replace(/\/+$/, "").replace(/^http/i, "ws")}/api/websocket`;

/**
 * Watches one entity. Calls `onPresence` whenever it changes between present
 * and absent, and `onStatus` as the connection comes and goes. Reconnects
 * with backoff. Returns the stop function.
 */
export function watchPresence(cfg: HaConfig, onPresence: (present: boolean) => void, onStatus: (ok: boolean, error?: string) => void): () => void {
  let ws: WebSocket | undefined;
  let stopped = false;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: boolean | undefined;
  const emit = (state: string) => {
    const p = isPresent(state, cfg.presentStates);
    if (p !== last) {
      last = p;
      onPresence(p);
    }
  };

  const connect = () => {
    if (stopped) return;
    try {
      ws = new WebSocket(wsUrl(cfg.url));
    } catch (e) {
      onStatus(false, errorMessage(e));
      return schedule();
    }
    let id = 1;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as { type: string; success?: boolean; result?: unknown; event?: { variables?: { trigger?: { to_state?: { state: string } } } }; id?: number };
      if (msg.type === "auth_required") ws!.send(JSON.stringify({ type: "auth", access_token: cfg.token }));
      else if (msg.type === "auth_invalid") {
        onStatus(false, "Home Assistant refused the token");
        stopped = true;
        ws!.close();
      } else if (msg.type === "auth_ok") {
        retry = 0;
        onStatus(true);
        // Current state first, then every change of this one entity.
        ws!.send(JSON.stringify({ id: id++, type: "get_states" }));
        ws!.send(JSON.stringify({ id: id++, type: "subscribe_trigger", trigger: { platform: "state", entity_id: cfg.entityId } }));
      } else if (msg.type === "result" && msg.id === 1 && Array.isArray(msg.result)) {
        const s = (msg.result as { entity_id: string; state: string }[]).find((x) => x.entity_id === cfg.entityId);
        if (s) emit(s.state);
      } else if (msg.type === "event") {
        const to = msg.event?.variables?.trigger?.to_state?.state;
        if (to) emit(to);
      }
    };
    ws.onclose = () => {
      if (!stopped) {
        onStatus(false, "connection closed");
        schedule();
      }
    };
    ws.onerror = () => ws?.close();
  };
  const schedule = () => {
    if (stopped) return;
    const delay = Math.min(60_000, 1000 * 2 ** retry++);
    timer = setTimeout(connect, delay);
    timer.unref?.();
  };
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    ws?.close();
  };
}

// ── Keeping one watcher per connection (on the instance that runs jobs) ─────
interface Watcher { key: string; stop: () => void }
const g = globalThis as unknown as { kindoPresence?: Map<string, Watcher> };
const watchers = (g.kindoPresence ??= new Map());

export function haConfig(c: Connection): HaConfig {
  const cfg = (c.config ?? {}) as { entityId?: string; presentStates?: string[] };
  return { url: c.url ?? "", token: c.secret ? decryptSecret(c.secret) : "", entityId: cfg.entityId ?? "", presentStates: cfg.presentStates ?? DEFAULT_PRESENT };
}

/** Starts, restarts or stops watchers so they match the household's Home Assistant connections. */
export async function syncPresenceWatchers(db: Tx) {
  const conns = await db.connection.findMany({ where: { kind: "homeassistant" } });
  const live = new Set<string>();
  for (const c of conns) {
    const cfg = haConfig(c);
    const key = `${cfg.url}|${cfg.entityId}|${c.secret}|${cfg.presentStates.join(",")}`;
    live.add(c.id);
    const w = watchers.get(c.id);
    if (w?.key === key) continue;
    w?.stop();
    const stop = watchPresence(
      cfg,
      (present) => void notify("presence", { present }),
      (ok, error) => void db.connection.update({ where: { id: c.id }, data: { status: ok ? "ok" : "error", lastError: ok ? null : error?.slice(0, 500), lastSyncAt: new Date() } })
        .catch(() => {}),
    );
    watchers.set(c.id, { key, stop });
    log.info("watching presence", { entity: cfg.entityId });
  }
  for (const [id, w] of watchers) {
    if (!live.has(id)) {
      w.stop();
      watchers.delete(id);
    }
  }
}
