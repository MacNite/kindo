import { EventEmitter } from "node:events";
import { Client } from "pg";
import { prisma } from "./db";
import { errorMessage, log } from "./log";

/**
 * Realtime sync between the wall and phones (§19.2, §20 D12).
 *
 * Writers call `notify(topic)` after committing. PostgreSQL fans the message
 * out to every app instance through LISTEN/NOTIFY; each instance relays it to
 * its own SSE clients (`/api/stream`), which then refetch what changed. No
 * extra service, and correct with more than one container.
 */
export const CHANNEL = "kindo_changes";

/** What changed. Clients refetch the matching slice. */
/**
 * `home` (switches changed) and `presence` are news from Home Assistant, not
 * stored data. `doorbell`: someone rang (§22); screens ask for the ring itself.
 */
export type Topic = "household" | "events" | "photos" | "presence" | "home" | "doorbell";
export interface Change { topic: Topic; present?: boolean }

export async function notify(topic: Topic, extra: Omit<Change, "topic"> = {}) {
  const payload = JSON.stringify({ topic, ...extra } satisfies Change);
  try {
    await prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${payload})`;
  } catch (e) {
    // A missed notification only delays other screens until their next refetch.
    log.warn("notify failed", { topic, error: errorMessage(e) });
  }
}

interface ListenerState { emitter: EventEmitter; client?: Client; connecting?: Promise<void>; retry: number }
const g = globalThis as unknown as { kindoRealtime?: ListenerState };
const state: ListenerState = (g.kindoRealtime ??= { emitter: new EventEmitter().setMaxListeners(0), retry: 0 });

async function connect() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  client.on("notification", (msg) => {
    if (msg.channel !== CHANNEL || !msg.payload) return;
    try {
      state.emitter.emit("change", JSON.parse(msg.payload) as Change);
    } catch {
      log.warn("ignoring malformed notification", { payload: msg.payload });
    }
  });
  client.on("error", (e) => {
    log.warn("realtime connection lost", { error: errorMessage(e) });
    reconnect();
  });
  client.on("end", () => reconnect());
  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
  state.client = client;
  state.retry = 0;
  // Anything may have changed while the connection was down.
  if (state.emitter.listenerCount("change")) state.emitter.emit("change", { topic: "household" } satisfies Change);
}

function reconnect() {
  if (!state.client && state.connecting) return;
  const old = state.client;
  state.client = undefined;
  state.connecting = undefined;
  old?.removeAllListeners();
  old?.end().catch(() => {});
  const delay = Math.min(30_000, 1000 * 2 ** state.retry++);
  setTimeout(() => void ensureListening(), delay).unref?.();
}

function ensureListening(): Promise<void> {
  if (state.client) return Promise.resolve();
  state.connecting ??= connect().catch((e) => {
    log.warn("realtime connect failed", { error: errorMessage(e) });
    state.connecting = undefined;
    reconnect();
  });
  return state.connecting;
}

/** Calls `fn` for every change announced by any instance. Returns the unsubscribe. */
export function subscribe(fn: (c: Change) => void): () => void {
  state.emitter.on("change", fn);
  void ensureListening();
  return () => state.emitter.off("change", fn);
}

/** Delivers a change to this instance's subscribers only (used by tests). */
export function emitLocal(c: Change) {
  state.emitter.emit("change", c);
}
