import { z } from "zod";
import type { Connection, Prisma } from "@prisma/client";
import {
  energyFlow, isAvailable, isOn, isSwitchable, toWatts,
  type HaEntityChoices, type HomeSetup, type HomeState,
} from "@/lib/home";
import type { Tx } from "./db";
import { UserError, notFound } from "./errors";
import { id } from "./validation";
import { haConfig, listStates, readState, refreshPresenceWatchers, switchEntities, type HaState, type HaStoredConfig } from "./homeassistant";
import { errorMessage, log } from "./log";

/**
 * Home control (§21, §20 D44): a few switches the admin picked, "everything
 * off", and the solar flow, all through the household's Home Assistant
 * connection. Devices only ever name an entity the admin added; the address
 * and token stay on the server (§17).
 */
const entityId = z.string().trim().regex(/^[a-z_]+\.[a-z0-9_]+$/, "an entity id like light.kitchen").max(255);
const sensorId = entityId.refine((e) => e.startsWith("sensor."), "a sensor");
export const H = {
  switch: z.object({ entityId, on: z.boolean() }),
  setup: z.object({
    id,
    controls: z.array(z.object({ entityId: entityId.refine(isSwitchable, "a light, switch, fan or helper"), name: z.string().trim().min(1).max(40) })).max(24)
      .refine((c) => new Set(c.map((x) => x.entityId)).size === c.length, "each entity once"),
    energy: z.object({
      solar: sensorId, feedIn: sensorId.optional(), draw: sensorId.optional(), house: sensorId.optional(),
      grid: sensorId.optional(), gridInvert: z.boolean().optional(),
    }).nullable(),
  }),
  byId: z.object({ id }),
  none: z.object({}).optional(),
};
type In<K extends keyof typeof H> = z.output<(typeof H)[K]>;

const homeConnection = (db: Tx) => db.connection.findFirst({ where: { kind: "homeassistant" }, orderBy: { createdAt: "desc" } });

/** What every screen may know: the switches' names and whether there is a solar view. */
export function homeSetupOf(conn: Pick<Connection, "config"> | null | undefined): HomeSetup | null {
  if (!conn) return null;
  const cfg = (conn.config ?? {}) as HaStoredConfig;
  const controls = cfg.controls ?? [];
  const energy = Boolean(cfg.energy?.solar);
  return controls.length || energy ? { controls, energy } : null;
}

// Several screens poll at once: one read of Home Assistant serves them all for a moment.
const CACHE_MS = 2_000;
const g = globalThis as unknown as { kindoHomeCache?: Map<string, { key: string; at: number; state: Promise<HomeState> }> };
const cache = (g.kindoHomeCache ??= new Map());

/** The switches and the solar flow right now, or null when Home control isn't set up. */
export async function readHome(db: Tx, now = Date.now()): Promise<HomeState | null> {
  const conn = await homeConnection(db);
  if (!homeSetupOf(conn)) return null;
  const key = `${conn!.id}|${JSON.stringify(conn!.config)}`;
  const hit = cache.get(conn!.id);
  if (hit && hit.key === key && now - hit.at < CACHE_MS) return hit.state;
  const state = fetchHome(conn!);
  cache.set(conn!.id, { key, at: now, state });
  return state;
}

async function fetchHome(conn: Connection): Promise<HomeState> {
  const cfg = haConfig(conn);
  const e = cfg.energy;
  const sensors = e ? [e.solar, e.feedIn, e.draw, e.house, e.grid].filter((x): x is string => Boolean(x)) : [];
  const ids = [...new Set([...cfg.controls.map((c) => c.entityId), ...sensors])];
  const results = await Promise.allSettled(ids.map((e) => readState(cfg.url, cfg.token, e)));
  const states = new Map<string, HaState>();
  results.forEach((r, i) => r.status === "fulfilled" && states.set(ids[i], r.value));
  const reachable = results.some((r) => r.status === "fulfilled");
  if (!reachable && results[0]?.status === "rejected") log.warn("home assistant unreachable", { error: errorMessage(results[0].reason) });
  const watts = (id: string) => {
    const s = states.get(id);
    return s ? toWatts(s.state, s.attributes.unit_of_measurement) : null;
  };
  // A sensor that isn't set up stays undefined, so energyFlow can tell it from one without a reading.
  const opt = (id?: string) => (id ? watts(id) : undefined);
  return {
    reachable,
    switches: cfg.controls.map((c) => {
      const s = states.get(c.entityId)?.state;
      return { ...c, on: isOn(s), available: isAvailable(s) };
    }),
    energy: e ? energyFlow({
      solar: watts(e.solar), feedIn: opt(e.feedIn), draw: opt(e.draw), house: opt(e.house), grid: opt(e.grid), gridInvert: e.gridInvert,
    }) : null,
  };
}

async function controlConnection(db: Tx) {
  const conn = await homeConnection(db);
  if (!conn) throw notFound("Home Assistant");
  cache.delete(conn.id);
  return { conn, cfg: haConfig(conn) };
}

/** Switches one of the admin's switches on or off. Nothing else can be switched from a device. */
export async function setSwitch(db: Tx, input: In<"switch">) {
  const { cfg } = await controlConnection(db);
  if (!cfg.controls.some((c) => c.entityId === input.entityId)) throw notFound("switch");
  await switchEntities(cfg.url, cfg.token, [input.entityId], input.on);
}

/** "Everything off": every switch Kindo shows, in one call. */
export async function allOff(db: Tx) {
  const { cfg } = await controlConnection(db);
  await switchEntities(cfg.url, cfg.token, cfg.controls.map((c) => c.entityId), false);
}

const POWER_UNITS = new Set(["w", "kw", "mw"]);

/** Lights, switches and power sensors Home Assistant has, for the admin to pick from. */
export async function listChoices(db: Tx, input: In<"byId">): Promise<HaEntityChoices> {
  const conn = await db.connection.findUnique({ where: { id: input.id } });
  if (!conn || conn.kind !== "homeassistant") throw notFound("connection");
  const cfg = haConfig(conn);
  const all = await listStates(cfg.url, cfg.token);
  const choice = (s: HaState) => ({ entityId: s.entity_id, name: s.attributes.friendly_name || s.entity_id, unit: s.attributes.unit_of_measurement });
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    switches: all.filter((s) => isSwitchable(s.entity_id)).map(choice).sort(byName).map(({ unit: _u, ...c }) => c),
    sensors: all.filter((s) => s.entity_id.startsWith("sensor.") && (s.attributes.device_class === "power" || POWER_UNITS.has((s.attributes.unit_of_measurement ?? "").toLowerCase())))
      .map(choice).sort(byName),
  };
}

/** Saves which switches and sensors Home control shows. */
export async function saveSetup(db: Tx, input: In<"setup">) {
  const conn = await db.connection.findUnique({ where: { id: input.id } });
  if (!conn || conn.kind !== "homeassistant") throw notFound("connection");
  if (input.energy) {
    const { solar, feedIn, draw, house, grid } = input.energy;
    const picked = [solar, feedIn, draw, house, grid].filter(Boolean);
    if (new Set(picked).size !== picked.length) throw new UserError("invalid", "solar, feed-in, draw, house and grid are different sensors");
  }
  const cfg = (conn.config ?? {}) as HaStoredConfig;
  const next: HaStoredConfig = { ...cfg, controls: input.controls, energy: input.energy ?? undefined };
  await db.connection.update({ where: { id: conn.id }, data: { config: next as Prisma.InputJsonValue } });
  cache.delete(conn.id);
  await refreshPresenceWatchers();
}
