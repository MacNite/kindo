import { describe, expect, it } from "vitest";
import { DEFAULT_WALL_TILES, completeWallTiles, completeWidgets, moved } from "./dashboard";

describe("completeWidgets (§4)", () => {
  it("adds widgets of later versions at the end, hidden", () => {
    const w = completeWidgets([{ id: "agenda", enabled: true, size: "m" }]);
    expect(w[0]).toEqual({ id: "agenda", enabled: true, size: "m" });
    expect(w.find((x) => x.id === "home")).toEqual({ id: "home", enabled: false, size: "m" });
    expect(w.find((x) => x.id === "birthdays")).toEqual({ id: "birthdays", enabled: false, size: "s" });
    expect(w).toHaveLength(12);
  });

  it("drops unknown and repeated widgets", () => {
    const w = completeWidgets([{ id: "nope", enabled: true, size: "s" }, { id: "clock", enabled: true, size: "s" }, { id: "clock", enabled: false, size: "l" }]);
    expect(w.filter((x) => x.id === "clock")).toEqual([{ id: "clock", enabled: true, size: "s" }]);
    expect(w.some((x) => (x.id as string) === "nope")).toBe(false);
  });
});

describe("completeWallTiles (§4, §21)", () => {
  it("starts from the wall as it always looked, Home control off", () => {
    expect(completeWallTiles([])).toEqual(DEFAULT_WALL_TILES);
    expect(completeWallTiles(null)).toEqual(DEFAULT_WALL_TILES);
    // The birthday wheel is there to switch on, but off until someone does (D46).
    expect(DEFAULT_WALL_TILES.find((x) => x.id === "birthdays")?.enabled).toBe(false);
  });

  it("keeps the household's order and adds what is missing", () => {
    const t = completeWallTiles([{ id: "home", enabled: true }, { id: "dates", enabled: false }]);
    expect(t.map((x) => x.id)).toEqual(["home", "dates", "weather", "meal", "shopping", "birthdays"]);
    expect(t[0].enabled).toBe(true);
  });
});

describe("moved", () => {
  it("swaps with the neighbour and stays put at the ends", () => {
    expect(moved([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moved([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});
