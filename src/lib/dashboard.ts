import type { WallTile, WallTileId, WidgetConfig, WidgetId } from "./types";

/** Every home-screen widget, so a widget added in a later version shows up hidden in "Customize". */
export const WIDGET_IDS: readonly WidgetId[] = ["clock", "weather", "agenda", "upcoming", "routines", "chores", "meals", "shopping", "dates", "birthdays", "photos", "home", "cameras"];
/** The wall display before anyone customises it: as it always looked, Home control and cameras off (§4, §21, §22). */
export const DEFAULT_WALL_TILES: readonly WallTile[] = [
  { id: "weather", enabled: true }, { id: "meal", enabled: true }, { id: "shopping", enabled: true }, { id: "dates", enabled: true }, { id: "birthdays", enabled: false }, { id: "home", enabled: false },
  { id: "cameras", enabled: false },
];
export const WALL_TILE_IDS: readonly WallTileId[] = DEFAULT_WALL_TILES.map((t) => t.id);

/** The stored widgets, unknown ones dropped and missing ones added at the end, hidden. */
export function completeWidgets(stored: unknown): WidgetConfig[] {
  const list = (Array.isArray(stored) ? stored : []) as WidgetConfig[];
  const known = list.filter((w, i) => WIDGET_IDS.includes(w?.id) && list.findIndex((x) => x.id === w.id) === i);
  const missing = WIDGET_IDS.filter((id) => !known.some((w) => w.id === id));
  return [...known, ...missing.map((id): WidgetConfig => ({ id, enabled: false, size: id === "home" || id === "cameras" ? "m" : "s" }))];
}

/** The stored wall tiles, the same way; nothing stored yet means the defaults. */
export function completeWallTiles(stored: unknown): WallTile[] {
  const list = (Array.isArray(stored) ? stored : []) as WallTile[];
  const known = list.filter((t, i) => WALL_TILE_IDS.includes(t?.id) && list.findIndex((x) => x.id === t.id) === i);
  const missing = DEFAULT_WALL_TILES.filter((d) => !known.some((t) => t.id === d.id));
  return [...known, ...missing.map((d) => ({ ...d }))];
}

/** Moves one item a step earlier or later in its list. */
export function moved<T>(list: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
