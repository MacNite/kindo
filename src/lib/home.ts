/**
 * Home control (§21): a few switches and the solar flow from Home Assistant.
 * Pure helpers shared by the server and the screens.
 */

/** Domains Kindo may switch on and off. Everything else stays read-only. */
export const SWITCHABLE_DOMAINS = ["light", "switch", "fan", "input_boolean"] as const;

export const domainOf = (entityId: string) => entityId.split(".")[0] ?? "";
export const isSwitchable = (entityId: string): boolean => (SWITCHABLE_DOMAINS as readonly string[]).includes(domainOf(entityId));

/** A switch the admin added to Kindo, with the name the family sees. */
export interface HomeControl { entityId: string; name: string }

/**
 * The power sensors behind the solar view. Only `solar` is required. Without
 * a `house` sensor, the house is worked out from solar and the grid.
 */
export interface EnergySensors {
  solar: string;
  /** Power fed into the grid, never negative. */
  feedIn?: string;
  /** Power drawn from the grid, never negative. */
  draw?: string;
  house?: string;
  /** Signed grid power (older setups). Feed-in and draw sensors win over it. */
  grid?: string;
  /** The signed grid sensor counts feed-in as positive (many inverters do). */
  gridInvert?: boolean;
}

/** What every screen may know about the setup: names and entity ids, never the address or token. */
export interface HomeSetup { controls: HomeControl[]; energy: boolean }

export interface SwitchState extends HomeControl { on: boolean; available: boolean }
/** Power in watts. `grid` is positive while the house draws from the grid, negative while it feeds in. */
export interface EnergyFlow { solar: number | null; house: number | null; grid: number | null }
export interface HomeState {
  switches: SwitchState[];
  energy: EnergyFlow | null;
  /** Home Assistant answered. When it doesn't, the switches show as unavailable. */
  reachable: boolean;
}

/** Entities an admin can pick from in Settings. */
export interface HaEntityChoice { entityId: string; name: string; unit?: string }
export interface HaEntityChoices { switches: HaEntityChoice[]; sensors: HaEntityChoice[] }

const UNIT_FACTOR: Record<string, number> = { w: 1, kw: 1000, mw: 1_000_000 };

/** A Home Assistant power state in watts, or null when the sensor has nothing usable. */
export function toWatts(state: string | undefined, unit?: string): number | null {
  if (state === undefined) return null;
  const n = Number(state);
  if (state.trim() === "" || !Number.isFinite(n)) return null;
  const f = UNIT_FACTOR[(unit ?? "W").trim().toLowerCase()];
  return f === undefined ? null : n * f;
}

/** Sensor readings in watts: `undefined` when no sensor is set up, `null` when it has nothing usable. */
export interface EnergyReadings {
  solar: number | null;
  feedIn?: number | null;
  draw?: number | null;
  house?: number | null;
  grid?: number | null;
  gridInvert?: boolean;
}

/**
 * Solar, house and grid in watts. The grid comes from the feed-in and draw
 * sensors (one not set up counts as nothing), else the signed grid sensor, else
 * house minus solar. The house comes from its sensor when it has a reading,
 * else solar plus grid.
 */
export function energyFlow(r: EnergyReadings): EnergyFlow {
  const { solar } = r;
  const meters = [r.feedIn, r.draw].filter((x) => x !== undefined);
  const fromMeters = meters.length === 0 ? undefined : meters.includes(null) ? null : (r.draw ?? 0) - (r.feedIn ?? 0);
  const signed = r.grid === undefined ? undefined : r.grid === null ? null : r.gridInvert ? -r.grid : r.grid;
  const measured = fromMeters !== undefined ? fromMeters : signed;
  const house = r.house ?? (solar !== null && measured != null ? Math.max(0, solar + measured) : null);
  const grid = measured !== undefined ? measured : solar !== null && r.house != null ? r.house - solar : null;
  return { solar, house, grid };
}

/** States that mean "on" for the switchable domains. */
export const isOn = (state: string | undefined) => state === "on";
export const isAvailable = (state: string | undefined) => state !== undefined && state !== "unavailable" && state !== "unknown";

/** Watts as the family reads them: "850 W", "3.2 kW". Grid power is shown without its sign. */
export function powerParts(watts: number): { value: number; unit: "W" | "kW"; digits: number } {
  const w = Math.abs(watts);
  if (w < 1000) return { value: Math.round(w), unit: "W", digits: 0 };
  return { value: Math.round(w / 100) / 10, unit: "kW", digits: 1 };
}
