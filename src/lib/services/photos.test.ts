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

  it("hands slots a small album can't fill to the others, by weight", () => {
    const sizes: Record<string, number> = { a: 5, b: 100, c: 100 };
    const pool = weightedPlaylist([album("a", true, 50), album("b", true, 30), album("c", true, 20)], (id) => photos(id, sizes[id]), 48, seeded);
    const count = (id: string) => pool.filter((p) => p.albumId === id).length;
    expect(pool).toHaveLength(48);
    expect(count("a")).toBe(5);
    expect(count("b")).toBeGreaterThan(count("c"));
    expect(new Set(pool.map((p) => p.id)).size).toBe(48);
  });

  it("stops when every selected album is used up", () => {
    const pool = weightedPlaylist([album("a", true, 90), album("b", true, 10)], (id) => photos(id, id === "a" ? 3 : 4), 48, seeded);
    expect(pool).toHaveLength(7);
  });

  it("is empty when no album is selected or the selected ones are empty", () => {
    expect(weightedPlaylist([album("a", false, 50)], of)).toEqual([]);
    expect(weightedPlaylist([album("a", true, 50)], () => [])).toEqual([]);
  });
});
