import { describe, expect, it } from "vitest";
import { energyFlow, isSwitchable, powerParts, toWatts } from "./home";

describe("toWatts (§21)", () => {
  it("reads watts and kilowatts", () => {
    expect(toWatts("850", "W")).toBe(850);
    expect(toWatts("3.2", "kW")).toBe(3200);
    expect(toWatts("1200")).toBe(1200);
  });

  it("has nothing for unavailable sensors and unknown units", () => {
    expect(toWatts("unavailable", "W")).toBeNull();
    expect(toWatts("", "W")).toBeNull();
    expect(toWatts("5", "kWh")).toBeNull();
    expect(toWatts(undefined)).toBeNull();
  });
});

describe("energyFlow (§21)", () => {
  it("works the grid out from house and solar without a grid sensor", () => {
    expect(energyFlow(3000, 1000, null)).toEqual({ solar: 3000, house: 1000, grid: -2000 });
    expect(energyFlow(500, 1500, null)).toEqual({ solar: 500, house: 1500, grid: 1000 });
  });

  it("prefers the grid sensor, turned around when it counts feed-in as positive", () => {
    expect(energyFlow(3000, 1000, -1900)).toEqual({ solar: 3000, house: 1000, grid: -1900 });
    expect(energyFlow(3000, 1000, 1900, true)).toEqual({ solar: 3000, house: 1000, grid: -1900 });
  });

  it("leaves the grid out when it can't be known", () => {
    expect(energyFlow(3000, null, null).grid).toBeNull();
  });
});

describe("powerParts", () => {
  it("shows watts below a kilowatt and one decimal above", () => {
    expect(powerParts(849.6)).toEqual({ value: 850, unit: "W", digits: 0 });
    expect(powerParts(-3240)).toEqual({ value: 3.2, unit: "kW", digits: 1 });
  });
});

describe("isSwitchable", () => {
  it("allows lights, switches, fans and helpers only", () => {
    expect(isSwitchable("light.kitchen")).toBe(true);
    expect(isSwitchable("switch.coffee")).toBe(true);
    expect(isSwitchable("lock.front_door")).toBe(false);
    expect(isSwitchable("script.everything")).toBe(false);
  });
});
