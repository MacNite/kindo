import type { Sky, Weather } from "@/lib/types";
import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { env } from "./env";
import { fetchChecked, readJson } from "./http";
import { retryDelayMs } from "./jobs";
import { UserError } from "./errors";
import { errorMessage, log } from "./log";

/**
 * Weather for the household's place (Settings → Family), from Open-Meteo
 * (§20 D55): free, no account, no key. The server looks the place up and
 * fetches the forecast every half hour; devices only ever see the stored
 * result in the snapshot.
 */
export const WEATHER_JOB = "weather";
const WEATHER_MINUTES = 30;
/** Today plus the four days the widget lists. */
const FORECAST_DAYS = 5;

/** What `Household.weather` holds. Days are keys in the household's time zone. */
export interface StoredWeather {
  /** The `Household.location` this forecast was fetched for. */
  location: string;
  place: string;
  now: number;
  sky: Sky;
  days: { day: string; sky: Sky; high: number; low: number; rainChance: number }[];
}

/** WMO weather codes (as Open-Meteo reports them) in the five skies Kindo draws. */
export function skyOf(code: number): Sky {
  if (code <= 1) return "sun";
  if (code === 2) return "partly";
  if (code === 3 || code === 45 || code === 48) return "cloud";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  return "rain";
}

interface GeoResult { name: string; latitude: number; longitude: number; country?: string; country_code?: string; admin1?: string; admin2?: string }
interface Forecast {
  current?: { temperature_2m: number; weather_code: number };
  daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] };
}

/**
 * The place a family typed, found. "Herten" takes the best match; "Herten,
 * Germany" or "Springfield, Illinois" prefer a match in that country or region.
 */
export async function findPlace(location: string, language = "de"): Promise<GeoResult> {
  const [name, ...rest] = location.split(",").map((s) => s.trim()).filter(Boolean);
  if (!name) throw new UserError("invalid", "no place");
  const url = new URL("/v1/search", env().WEATHER_GEOCODING_BASE);
  url.search = new URLSearchParams({ name, count: "10", language, format: "json" }).toString();
  const res = await fetchChecked(url.toString(), { maxBytes: 512 * 1024 });
  if (!res.ok) throw new UserError("remote", `geocoding: HTTP ${res.status}`);
  const { results = [] } = await readJson<{ results?: GeoResult[] }>(res);
  const hints = rest.map((h) => h.toLowerCase());
  const matches = (r: GeoResult) => hints.every((h) => [r.country, r.country_code, r.admin1, r.admin2].some((v) => v?.toLowerCase() === h));
  // A hint in another language ("Germany" where the service says "Deutschland") still finds the best match.
  const found = results.find(matches) ?? results[0];
  if (!found) throw new UserError("notFound", `place not found: ${location}`);
  return found;
}

export async function fetchWeather(location: string, timezone: string): Promise<StoredWeather> {
  const place = await findPlace(location);
  const url = new URL("/v1/forecast", env().WEATHER_API_BASE);
  url.search = new URLSearchParams({
    latitude: String(place.latitude), longitude: String(place.longitude), timezone, forecast_days: String(FORECAST_DAYS),
    current: "temperature_2m,weather_code", daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  }).toString();
  const res = await fetchChecked(url.toString(), { maxBytes: 512 * 1024 });
  if (!res.ok) throw new UserError("remote", `forecast: HTTP ${res.status}`);
  const f = await readJson<Forecast>(res);
  if (!f.current || !f.daily?.time?.length) throw new UserError("remote", "forecast: no data");
  const d = f.daily;
  return {
    location, place: place.name, now: Math.round(f.current.temperature_2m), sky: skyOf(f.current.weather_code),
    days: d.time.map((day, i) => ({
      day, sky: skyOf(d.weather_code[i]), high: Math.round(d.temperature_2m_max[i]), low: Math.round(d.temperature_2m_min[i]), rainChance: d.precipitation_probability_max[i] ?? 0,
    })),
  };
}

/** Fetches the forecast for the household's place and stores it. A failure keeps the last forecast. */
export async function syncWeather(db: Tx, now = new Date()) {
  const h = await db.household.findUnique({ where: { id: 1 }, select: { location: true, timezone: true } });
  if (!h?.location) return;
  try {
    const weather = await fetchWeather(h.location, h.timezone);
    // The place changed meanwhile: that change already asked for a new fetch.
    const { count } = await db.household.updateMany({
      where: { id: 1, location: h.location },
      data: { weather: weather as unknown as Prisma.InputJsonValue, weatherAt: now, weatherError: null, weatherFailedAt: null, weatherFailures: 0 },
    });
    if (count) log.info("weather fetched", { place: weather.place });
  } catch (e) {
    await db.household.update({
      where: { id: 1 }, data: { weatherError: errorMessage(e).slice(0, 500), weatherFailedAt: now, weatherFailures: { increment: 1 } },
    });
    log.warn("weather fetch failed", { error: errorMessage(e) });
    throw e;
  }
}

/** Is a fetch due? Only with a place set; after a failure, retries back off up to the normal interval. */
export async function weatherDue(db: Tx, now = new Date()) {
  const h = await db.household.findUnique({ where: { id: 1 }, select: { location: true, demo: true, weatherAt: true, weatherFailedAt: true, weatherFailures: true } });
  if (!h?.location || h.demo) return false;
  const interval = WEATHER_MINUTES * 60_000;
  if (h.weatherFailedAt && h.weatherFailures > 0) return now.getTime() - h.weatherFailedAt.getTime() >= retryDelayMs(h.weatherFailures, interval);
  return !h.weatherAt || now.getTime() - h.weatherAt.getTime() > interval;
}

/** The day key of `now` in `timeZone`. */
const dayIn = (now: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
/** Noon UTC on that day: the same calendar day on every device, whatever its time zone. */
const dateOf = (day: string) => new Date(`${day}T12:00:00Z`);

/** The stored forecast as the screens show it; null when there is none for the current place, or it is out of date. */
export function weatherForWire(stored: Prisma.JsonValue | null, location: string | null, timeZone: string, now = new Date()): Weather | null {
  const w = stored as unknown as StoredWeather | null;
  if (!w || !location || w.location !== location) return null;
  const today = dayIn(now, timeZone);
  const i = w.days.findIndex((d) => d.day === today);
  if (i < 0) return null;
  const t = w.days[i];
  return {
    place: w.place, now: w.now, sky: w.sky, high: t.high, low: t.low, rainChance: t.rainChance,
    days: w.days.slice(i + 1).map((d) => ({ date: dateOf(d.day), sky: d.sky, high: d.high, low: d.low })),
  };
}
