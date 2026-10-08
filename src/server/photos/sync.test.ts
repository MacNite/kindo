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
});

describe("diskCache", () => {
  it("refuses a size that would empty the cache on every write", () => {
    expect(() => diskCache("/nonexistent", Number.NaN)).toThrow(/positive/);
    expect(() => diskCache("/nonexistent", 0)).toThrow(/positive/);
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
