import { describe, expect, it } from "vitest";
import { buildPool } from "./photos";
import type { PhotoAlbum } from "../types";

const album = (id: string, selected: boolean, weight: number): PhotoAlbum => ({ id, serverId: "s", name: id, count: 10, selected, weight });

describe("buildPool", () => {
  it("only draws from selected albums, across servers", () => {
    const pool = buildPool([album("al-2026", true, 50), album("al-kids", false, 50), { ...album("al-shared", true, 50), serverId: "other" }]);
    expect(new Set(pool.map((p) => p.albumId))).toEqual(new Set(["al-2026", "al-shared"]));
  });

  it("gives heavier albums more photos", () => {
    const pool = buildPool([album("al-2026", true, 80), album("al-kids", true, 20)]);
    const count = (id: string) => pool.filter((p) => p.albumId === id).length;
    expect(count("al-2026")).toBeGreaterThan(count("al-kids"));
  });
});
