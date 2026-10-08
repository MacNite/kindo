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
  it("works the house out from solar, feed-in and draw", () => {
    expect(energyFlow({ solar: 3200, feedIn: 2000, draw: 0 })).toEqual({ solar: 3200, house: 1200, grid: -2000 });
    expect(energyFlow({ solar: 500, feedIn: 0, draw: 1000 })).toEqual({ solar: 500, house: 1500, grid: 1000 });
  });

  it("counts a feed-in or draw sensor that isn't set up as nothing", () => {
    expect(energyFlow({ solar: 0, draw: 800 })).toEqual({ solar: 0, house: 800, grid: 800 });
    expect(energyFlow({ solar: 3000, feedIn: 1000 })).toEqual({ solar: 3000, house: 2000, grid: -1000 });
  });

  it("never shows a house below zero while sensors catch up", () => {
    expect(energyFlow({ solar: 500, feedIn: 2000, draw: 0 }).house).toBe(0);
  });

  it("prefers the house sensor when there is one", () => {
    expect(energyFlow({ solar: 3000, feedIn: 1900, draw: 0, house: 1000 })).toEqual({ solar: 3000, house: 1000, grid: -1900 });
  });

  it("works the grid out from house and solar without grid sensors", () => {
    expect(energyFlow({ solar: 3000, house: 1000 })).toEqual({ solar: 3000, house: 1000, grid: -2000 });
    expect(energyFlow({ solar: 500, house: 1500 })).toEqual({ solar: 500, house: 1500, grid: 1000 });
  });

  it("still reads a signed grid sensor, turned around when it counts feed-in as positive", () => {
    expect(energyFlow({ solar: 3000, house: 1000, grid: -1900 })).toEqual({ solar: 3000, house: 1000, grid: -1900 });
    expect(energyFlow({ solar: 3000, house: 1000, grid: 1900, gridInvert: true })).toEqual({ solar: 3000, house: 1000, grid: -1900 });
    expect(energyFlow({ solar: 3000, grid: -1900 })).toEqual({ solar: 3000, house: 1100, grid: -1900 });
  });

  it("leaves out what can't be known", () => {
    expect(energyFlow({ solar: 3000 })).toEqual({ solar: 3000, house: null, grid: null });
    expect(energyFlow({ solar: 3000, feedIn: null, draw: 0 })).toEqual({ solar: 3000, house: null, grid: null });
    expect(energyFlow({ solar: null, feedIn: 0, draw: 500 })).toEqual({ solar: null, house: null, grid: 500 });
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
