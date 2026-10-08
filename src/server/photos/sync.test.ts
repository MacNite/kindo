import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tx } from "../db";
import { fetchChecked } from "../http";
import type { DiskCache } from "./cache";
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

describe("fetchChecked", () => {
  it("names the network cause instead of only \"fetch failed\"", async () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:2283"), { code: "ECONNREFUSED" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed", { cause }); }));
    await expect(fetchChecked("http://immich.test/api/x")).rejects.toThrow("immich.test: fetch failed (ECONNREFUSED)");
  });
});
