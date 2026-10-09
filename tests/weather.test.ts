import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { skyOf, syncWeather, weatherDue } from "@/server/weather";
import { updateHousehold } from "@/server/household";
import { loadSnapshot } from "@/server/snapshot";
import { createHousehold } from "@/server/demo/seed";
import { resetEnvCache } from "@/server/env";
import { TEST_DB, VIEWER, resetTestDatabase } from "./db";

describe("weather codes", () => {
  it("draws WMO codes as one of five skies", () => {
    expect([0, 1, 2, 3, 45, 61, 80, 95, 71, 86].map(skyOf)).toEqual(["sun", "sun", "partly", "cloud", "cloud", "rain", "rain", "rain", "snow", "snow"]);
  });
});

describe.skipIf(!TEST_DB)("weather from Open-Meteo (§20 D55)", () => {
  let db: PrismaClient;
  let server: Server;
  let fail = false;
  const asked: string[] = [];

  beforeAll(async () => {
    db = await resetTestDatabase();
    await createHousehold(db, { name: "Familie Test", timezone: "Europe/Berlin" });
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      asked.push(url.pathname + url.search);
      if (fail) return void res.writeHead(500).end();
      const json = (body: unknown) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      if (url.pathname === "/v1/search") {
        return json(url.searchParams.get("name") === "Herten"
          ? { results: [{ name: "Herten", latitude: 51.6, longitude: 7.13, country: "Deutschland", country_code: "DE", admin1: "Nordrhein-Westfalen" }] }
          : {});
      }
      json({
        current: { temperature_2m: 11.6, weather_code: 3 },
        daily: {
          time: ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"], weather_code: [61, 0, 2, 3, 71],
          temperature_2m_max: [14.4, 16, 15, 12, 4], temperature_2m_min: [7.2, 8, 6, 5, -1], precipitation_probability_max: [80, 0, 10, null, 60],
        },
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    vi.stubEnv("WEATHER_API_BASE", base);
    vi.stubEnv("WEATHER_GEOCODING_BASE", base);
    resetEnvCache();
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    resetEnvCache();
    server?.close();
    await db?.$disconnect();
  });

  const now = new Date("2026-10-09T08:00:00Z");

  it("fetches nothing without a place", async () => {
    expect(await weatherDue(db, now)).toBe(false);
    expect((await loadSnapshot(db, VIEWER, now))?.weather).toBeNull();
  });

  it("finds the place, fetches the forecast and shows it", async () => {
    expect(await updateHousehold(db, { name: "Familie Test", timezone: "Europe/Berlin", location: "Herten, Deutschland" })).toEqual({ moved: true });
    expect(await weatherDue(db, now)).toBe(true);
    await syncWeather(db, now);
    expect(asked.find((a) => a.startsWith("/v1/forecast"))).toMatch(/latitude=51\.6.*timezone=Europe%2FBerlin/);
    expect(await weatherDue(db, now)).toBe(false);
    const w = (await loadSnapshot(db, VIEWER, now))?.weather;
    expect(w).toMatchObject({ place: "Herten", now: 12, sky: "cloud", high: 14, low: 7, rainChance: 80 });
    expect(w?.days.map((d) => d.sky)).toEqual(["sun", "partly", "cloud", "snow"]);
    expect(w?.days[0].date.toISOString()).toBe("2026-10-10T12:00:00.000Z");
    // Half an hour later it's due again.
    expect(await weatherDue(db, new Date(now.getTime() + 31 * 60_000))).toBe(true);
  });

  it("drops the forecast when the place changes, and reports a place it can't find", async () => {
    await updateHousehold(db, { name: "Familie Test", timezone: "Europe/Berlin", location: "Nirgendwo" });
    expect((await loadSnapshot(db, VIEWER, now))?.weather).toBeNull();
    await expect(syncWeather(db, now)).rejects.toThrow(/not found/);
    expect((await loadSnapshot(db, VIEWER, now))?.household.weatherError).toMatch(/not found/);
    // Retries back off.
    expect(await weatherDue(db, new Date(now.getTime() + 60_000))).toBe(false);
  });

  it("keeps the last forecast when the service fails", async () => {
    await updateHousehold(db, { name: "Familie Test", timezone: "Europe/Berlin", location: "Herten" });
    await syncWeather(db, now);
    fail = true;
    await expect(syncWeather(db, now)).rejects.toThrow();
    fail = false;
    expect((await loadSnapshot(db, VIEWER, now))?.weather?.place).toBe("Herten");
  });
});
