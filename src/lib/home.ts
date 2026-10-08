/**
 * Home control (§21): a few switches and the solar flow from Home Assistant.
 * Pure helpers shared by the server and the screens.
 */

/** Domains Kindo may switch on and off. Everything else stays read-only. */
export const SWITCHABLE_DOMAINS = ["light", "switch", "fan", "input_boolean"] as const;
export type SwitchDomain = (typeof SWITCHABLE_DOMAINS)[number];

export const domainOf = (entityId: string) => entityId.split(".")[0] ?? "";
export const isSwitchable = (entityId: string): boolean => (SWITCHABLE_DOMAINS as readonly string[]).includes(domainOf(entityId));

/** A switch the admin added to Kindo, with the name the family sees. */
export interface HomeControl { entityId: string; name: string }

/** The power sensors behind the solar view. Only `solar` is required. */
export interface EnergySensors {
  solar: string;
  house?: string;
  /** Signed grid power. Without it, the grid is worked out as house minus solar. */
  grid?: string;
  /** The grid sensor counts feed-in as positive (many inverters do). */
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

/** Solar, house and grid in watts, deriving the grid from the other two when there is no grid sensor. */
export function energyFlow(solar: number | null, house: number | null, grid: number | null, gridInvert = false): EnergyFlow {
  const g = grid !== null ? (gridInvert ? -grid : grid) : solar !== null && house !== null ? house - solar : null;
  return { solar, house, grid: g };
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
