import { describe, expect, it } from "vitest";
import { weightedPlaylist } from "./photos";
import type { Photo, PhotoAlbum } from "../types";

const album = (id: string, selected: boolean, weight: number, server = "s"): PhotoAlbum => ({ id, server, name: id, count: 10, selected, weight });
const photos = (albumId: string, n = 40): Photo[] => Array.from({ length: n }, (_, i) => ({ id: `${albumId}-${i}`, albumId, seed: i }));
const of = (id: string) => photos(id);
let s = 1;
const seeded = () => ((s = (s * 16807) % 2147483647) / 2147483647);

describe("weightedPlaylist", () => {
  it("only draws from selected albums, across servers", () => {
    const pool = weightedPlaylist([album("a", true, 50), album("b", false, 50), album("c", true, 50, "other")], of, 48, seeded);
    expect(new Set(pool.map((p) => p.albumId))).toEqual(new Set(["a", "c"]));
  });

  it("gives heavier albums more photos", () => {
    const pool = weightedPlaylist([album("a", true, 80), album("b", true, 20)], of, 48, seeded);
    const count = (id: string) => pool.filter((p) => p.albumId === id).length;
    expect(count("a")).toBeGreaterThan(count("b"));
    expect(count("b")).toBeGreaterThan(0);
  });

  it("never repeats a photo and never asks for more than an album has", () => {
    const pool = weightedPlaylist([album("a", true, 100)], (id) => photos(id, 5), 48, seeded);
    expect(pool).toHaveLength(5);
    expect(new Set(pool.map((p) => p.id)).size).toBe(5);
  });

  it("is empty when no album is selected or the selected ones are empty", () => {
    expect(weightedPlaylist([album("a", false, 50)], of)).toEqual([]);
    expect(weightedPlaylist([album("a", true, 50)], () => [])).toEqual([]);
  });
});
