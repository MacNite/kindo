import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tx } from "../db";
import { fetchChecked, readJson } from "../http";
import { diskCache, type DiskCache } from "./cache";
import { getPhoto } from "./sync";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const db = {
  photoAsset: {
    findUnique: async () => ({ remoteId: "r1", album: { connection: { url: "http://immich.test", secret: null } } }),
  },
} as unknown as Tx;

afterEach(() => vi.unstubAllGlobals());

describe("getPhoto", () => {
  it("still serves the photo when the cache can't be written", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(jpeg, { headers: { "content-type": "image/jpeg" } })));
    const cache: DiskCache = { get: async () => null, put: async () => { throw new Error("EACCES: permission denied, mkdir '/data/cache/photos'"); } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const img = await getPhoto(db, "a1", "preview", cache);
    expect(img.type).toBe("image/jpeg");
    expect(img.body.equals(jpeg)).toBe(true);
  });

  it("doesn't serve a cached photo Kindo no longer knows", async () => {
    const gone = { photoAsset: { findUnique: async () => null } } as unknown as Tx;
    const cache: DiskCache = { get: async () => ({ body: jpeg, type: "image/jpeg" }), put: async () => {} };
    await expect(getPhoto(gone, "a1", "preview", cache)).rejects.toMatchObject({ code: "notFound" });
  });
});

describe("diskCache", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = "";
  });

  it("refuses a size that would empty the cache on every write", () => {
    expect(() => diskCache("/nonexistent", Number.NaN)).toThrow(/positive/);
    expect(() => diskCache("/nonexistent", 0)).toThrow(/positive/);
  });

  it("never lets a reader see a picture half written", async () => {
    dir = await mkdtemp(join(tmpdir(), "kindo-cache-"));
    const c = diskCache(dir, 64 * 1024 * 1024);
    const big = Buffer.concat([jpeg, Buffer.alloc(8 * 1024 * 1024, 7)]);
    let reading = true;
    const seen: number[] = [];
    const reader = (async () => {
      while (reading) {
        const hit = await c.get("a1-preview");
        if (hit) seen.push(hit.body.length);
      }
    })();
    await Promise.all([c.put("a1-preview", big), c.put("a1-preview", big)]);
    reading = false;
    await reader;
    expect(seen.every((n) => n === big.length)).toBe(true);
    expect((await c.get("a1-preview"))?.body.equals(big)).toBe(true);
    expect(await readdir(dir)).toEqual(["a1-preview"]);
  });

  it("clears what a crash left half written, but not a write in progress", async () => {
    dir = await mkdtemp(join(tmpdir(), "kindo-cache-"));
    const c = diskCache(dir, 64 * 1024 * 1024);
    const stale = join(dir, "a1-preview.tmp-crashed");
    const fresh = join(dir, "a2-preview.tmp-writing");
    await writeFile(stale, jpeg.subarray(0, 3));
    await writeFile(fresh, jpeg.subarray(0, 3));
    const hourAgo = new Date(Date.now() - 3_600_000);
    await utimes(stale, hourAgo, hourAgo);
    await c.put("a3-preview", jpeg);
    expect((await readdir(dir)).sort()).toEqual(["a2-preview.tmp-writing", "a3-preview"]);
    expect(await c.get("a1-preview")).toBeNull();
  });
});

describe("fetchChecked", () => {
  it("names the network cause instead of only \"fetch failed\"", async () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:2283"), { code: "ECONNREFUSED" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed", { cause }); }));
    await expect(fetchChecked("http://immich.test/api/x")).rejects.toThrow("immich.test: fetch failed (ECONNREFUSED)");
  });

  // A server that streams without Content-Length (chunked) is cut off while reading.
  const chunked = (bytes: number) => new Response(new ReadableStream({
    start(c) {
      for (let sent = 0; sent < bytes; sent += 1024) c.enqueue(new Uint8Array(1024).fill(0x20));
      c.close();
    },
  }), { headers: { "content-type": "application/json" } });

  it("stops reading a body past the size limit, without Content-Length", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => chunked(64 * 1024)));
    await expect(readJson(await fetchChecked("http://immich.test/api/x", { maxBytes: 16 * 1024 }))).rejects.toThrow("immich.test: response too large");
    await expect((await fetchChecked("http://immich.test/api/x", { maxBytes: 16 * 1024 })).arrayBuffer()).rejects.toThrow("response too large");
  });

  it("reads a body within the limit, and says when it isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }))));
    expect(await readJson(await fetchChecked("http://immich.test/api/x", { maxBytes: 1024 }))).toEqual({ ok: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    await expect(readJson(await fetchChecked("http://immich.test/api/x"))).rejects.toMatchObject({ code: "remote" });
  });
});
