import type { Connection } from "@prisma/client";
import type { EnergySensors, HomeControl } from "@/lib/home";
import type { Tx } from "./db";
import { decryptSecret } from "./crypto";
import { ringFor } from "./doorbell";
import { frigateCameras } from "./frigate";
import { UserError } from "./errors";
import { fetchChecked } from "./http";
import { errorMessage, log } from "./log";
import { notify } from "./realtime";
import { wakeJob } from "./jobs";

/**
 * Home Assistant (§13, §19.8, §21, §22, §20 D39, D44, D48): presence wakes
 * the wall from the photo frame, a few switches and the solar flow show in
 * Home control, and a doorbell's visitor sensor rings on every screen. Kindo talks to Home Assistant with a long-lived token, on the
 * server only: over the WebSocket API for changes, over REST for reads and
 * switching.
 */
export interface HaConfig {
  url: string;
  token: string;
  /** The presence entity; empty when Home Assistant is connected only for Home control. */
  entityId: string;
  presentStates: string[];
  controls: HomeControl[];
  energy?: EnergySensors;
  /** Doorbell buttons (§22): binary sensors of the household's Frigate cameras. */
  visitors?: string[];
}
/** States that mean "someone is here", for motion/occupancy sensors, person and device trackers. */
export const DEFAULT_PRESENT = ["on", "home", "detected", "occupied"];

export const isPresent = (state: string, present = DEFAULT_PRESENT) => present.includes(state.toLowerCase());

/** An entity as Home Assistant's REST API returns it. */
export interface HaState { entity_id: string; state: string; attributes: { friendly_name?: string; unit_of_measurement?: string; device_class?: string } }

const base = (url: string) => url.replace(/\/+$/, "");
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function haFetch(url: string, token: string, path: string, init: RequestInit = {}, what = "Home Assistant") {
  const res = await fetchChecked(`${base(url)}${path}`, { timeoutMs: 10_000, ...init, headers: { ...auth(token), "content-type": "application/json", ...init.headers } });
  if (res.status === 401) throw new UserError("remote", "Home Assistant refused the token");
  if (res.status === 404) throw new UserError("remote", `no ${what}`);
  if (!res.ok) throw new UserError("remote", `Home Assistant: HTTP ${res.status}`);
  return res;
}

/** Checks the token and the entity, returning its current state. */
export async function readEntity(url: string, token: string, entityId: string): Promise<string> {
  return (await readState(url, token, entityId)).state;
}

export async function readState(url: string, token: string, entityId: string): Promise<HaState> {
  const res = await haFetch(url, token, `/api/states/${encodeURIComponent(entityId)}`, {}, `entity ${entityId}`);
  return (await res.json()) as HaState;
}

/** Checks the address and the token without naming an entity. */
export async function checkToken(url: string, token: string) {
  await haFetch(url, token, "/api/", {}, "Home Assistant API at this address");
}

/** Every entity Home Assistant has, for picking switches and sensors in Settings. */
export async function listStates(url: string, token: string): Promise<HaState[]> {
  const res = await haFetch(url, token, "/api/states");
  return (await res.json()) as HaState[];
}

/**
 * Switches entities on or off. `homeassistant.turn_on/turn_off` works across
 * lights, switches, fans and helpers, so "everything off" is one call.
 */
export async function switchEntities(url: string, token: string, entityIds: string[], on: boolean) {
  if (!entityIds.length) return;
  await haFetch(url, token, `/api/services/homeassistant/${on ? "turn_on" : "turn_off"}`, { method: "POST", body: JSON.stringify({ entity_id: entityIds }) }, "service");
}

const wsUrl = (url: string) => `${base(url).replace(/^http/i, "ws")}/api/websocket`;

interface WatchHandlers {
  onPresence: (present: boolean) => void;
  /** A switch Kindo shows changed, whoever switched it. */
  onControls: () => void;
  /** A doorbell button was pressed: its visitor sensor went from off to on. */
  onVisitor?: (entityId: string) => void;
  onStatus: (ok: boolean, error?: string) => void;
}

/**
 * Follows the presence entity and the switches. Calls `onPresence` whenever
 * presence changes between present and absent, `onControls` when a switch
 * changes, and `onStatus` as the connection comes and goes. Reconnects with
 * backoff. Returns the stop function.
 */
export function watchHome(cfg: HaConfig, { onPresence, onControls, onVisitor, onStatus }: WatchHandlers): () => void {
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
  const controlIds = cfg.controls.map((c) => c.entityId);
  const visitorIds = cfg.visitors ?? [];

  const connect = () => {
    if (stopped) return;
    try {
      ws = new WebSocket(wsUrl(cfg.url));
    } catch (e) {
      onStatus(false, errorMessage(e));
      return schedule();
    }
    let id = 1;
    const ids = { states: 0, presence: 0, controls: 0, visitors: 0 };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as { type: string; success?: boolean; result?: unknown; event?: { variables?: { trigger?: { entity_id?: string; to_state?: { state: string } } } }; id?: number };
      if (msg.type === "auth_required") ws!.send(JSON.stringify({ type: "auth", access_token: cfg.token }));
      else if (msg.type === "auth_invalid") {
        onStatus(false, "Home Assistant refused the token");
        stopped = true;
        ws!.close();
      } else if (msg.type === "auth_ok") {
        retry = 0;
        onStatus(true);
        // Current state first, then every change of the entities Kindo follows.
        if (cfg.entityId) {
          ids.states = id++;
          ws!.send(JSON.stringify({ id: ids.states, type: "get_states" }));
          ids.presence = id++;
          ws!.send(JSON.stringify({ id: ids.presence, type: "subscribe_trigger", trigger: { platform: "state", entity_id: cfg.entityId } }));
        }
        if (controlIds.length) {
          ids.controls = id++;
          ws!.send(JSON.stringify({ id: ids.controls, type: "subscribe_trigger", trigger: { platform: "state", entity_id: controlIds } }));
        }
        // Only a press: off to on. A reconnect or a sensor coming back from "unavailable" is no ring.
        if (visitorIds.length && onVisitor) {
          ids.visitors = id++;
          ws!.send(JSON.stringify({ id: ids.visitors, type: "subscribe_trigger", trigger: { platform: "state", entity_id: visitorIds, from: "off", to: "on" } }));
        }
      } else if (msg.type === "result" && ids.states && msg.id === ids.states && Array.isArray(msg.result)) {
        const s = (msg.result as { entity_id: string; state: string }[]).find((x) => x.entity_id === cfg.entityId);
        if (s) emit(s.state);
      } else if (msg.type === "event" && ids.visitors && msg.id === ids.visitors) {
        const entity = msg.event?.variables?.trigger?.entity_id;
        if (entity && visitorIds.includes(entity) && msg.event?.variables?.trigger?.to_state?.state === "on") onVisitor?.(entity);
      } else if (msg.type === "event" && ids.controls && msg.id === ids.controls) {
        onControls();
      } else if (msg.type === "event" && ids.presence && msg.id === ids.presence) {
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

/** Non-secret settings stored on the connection (`Connection.config`). */
export interface HaStoredConfig { entityId?: string; presentStates?: string[]; controls?: HomeControl[]; energy?: EnergySensors }

export function haConfig(c: Connection): HaConfig {
  const cfg = (c.config ?? {}) as HaStoredConfig;
  return {
    url: c.url ?? "", token: c.secret ? decryptSecret(c.secret) : "", entityId: cfg.entityId ?? "",
    presentStates: cfg.presentStates ?? DEFAULT_PRESENT, controls: cfg.controls ?? [], energy: cfg.energy?.solar ? cfg.energy : undefined,
  };
}

/** Switches change in bursts ("everything off"): one refetch per burst is enough. */
function debounced(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
    t.unref?.();
  };
}

/** The background job that keeps the watchers (src/server/register-jobs.ts). */
export const PRESENCE_JOB = "presence";

/**
 * After Settings changed a Home Assistant or Frigate connection: asks the
 * instance that runs the jobs to follow the new setup now (§20 D39, D48).
 * Request handlers call this, never `syncPresenceWatchers`, so only one
 * instance holds a subscription and stores rings.
 */
export const refreshPresenceWatchers = () => wakeJob(PRESENCE_JOB);

/** Stops every watcher: this instance no longer runs the jobs. */
export function stopPresenceWatchers() {
  for (const w of watchers.values()) w.stop();
  watchers.clear();
}

/**
 * Starts, restarts or stops watchers so they match the household's Home
 * Assistant connections. Only the job leader calls this (the presence job).
 */
export async function syncPresenceWatchers(db: Tx) {
  const conns = await db.connection.findMany({ where: { kind: "homeassistant" } });
  const frigate = await db.connection.findFirst({ where: { kind: "frigate" }, orderBy: { createdAt: "desc" } });
  const visitors = [...new Set(frigateCameras(frigate).flatMap((c) => (c.visitorEntity ? [c.visitorEntity] : [])))];
  const live = new Set<string>();
  for (const c of conns) {
    const cfg = { ...haConfig(c), visitors };
    const key = `${cfg.url}|${cfg.entityId}|${c.secret}|${cfg.presentStates.join(",")}|${cfg.controls.map((x) => x.entityId).join(",")}|${visitors.join(",")}`;
    live.add(c.id);
    const w = watchers.get(c.id);
    if (w?.key === key) continue;
    w?.stop();
    const stop = watchHome(cfg, {
      onPresence: (present) => void notify("presence", { present }),
      onControls: debounced(() => void notify("home"), 300),
      onVisitor: (entity) => void ringFor(db, entity).catch((e) => log.warn("doorbell ring failed", { entity, error: errorMessage(e) })),
      onStatus: (ok, error) => void db.connection.update({ where: { id: c.id }, data: { status: ok ? "ok" : "error", lastError: ok ? null : error?.slice(0, 500), lastSyncAt: new Date() } })
        .catch(() => {}),
    });
    watchers.set(c.id, { key, stop });
    log.info("watching home assistant", { presence: cfg.entityId || undefined, controls: cfg.controls.length, doorbells: visitors.length || undefined });
  }
  for (const [id, w] of watchers) {
    if (!live.has(id)) {
      w.stop();
      watchers.delete(id);
    }
  }
}
