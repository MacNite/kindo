import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import * as C from "@/server/connections";
import { updateAlbum } from "@/server/household";
import { albumSelected, getPhoto } from "@/server/photos/sync";
import { diskCache, sniffImageType } from "@/server/photos/cache";
import { photoPlaylist } from "@/server/photos/playlist";
import { seedDemo } from "@/server/demo/seed";
// @ts-expect-error: plain ESM test helper
import { IMMICH_KEY, startImmichMock } from "../e2e/immich-mock.mjs";
import { TEST_DB, resetTestDatabase } from "./db";

describe("the photo cache (§19.6)", () => {
  it("evicts the least recently used photos once over its cap", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kindo-cache-"));
    const c = diskCache(dir, 2500);
    const img = Buffer.alloc(1000, 1);
    await c.put("a", img);
    await new Promise((r) => setTimeout(r, 20));
    await c.put("b", img);
    await new Promise((r) => setTimeout(r, 20));
    await c.get("a"); // a is now newer than b
    await new Promise((r) => setTimeout(r, 20));
    await c.put("c", img);
    expect((await readdir(dir)).sort()).toEqual(["a", "c"]);
    await rm(dir, { recursive: true });
  });

  it("knows an image by its first bytes", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(sniffImageType(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
  });
});

describe.skipIf(!TEST_DB)("Immich (§19.6)", () => {
  let db: PrismaClient;
  let mock: { server: Server; stats: { thumbnails: number }; url: string };
  let cacheDir = "";

  beforeAll(async () => {
    db = await resetTestDatabase();
    await db.$transaction((tx) => seedDemo(tx), { timeout: 60_000 });
    mock = await startImmichMock();
    cacheDir = await mkdtemp(join(tmpdir(), "kindo-photos-"));
  }, 60_000);
  afterAll(async () => {
    mock?.server.close();
    await rm(cacheDir, { recursive: true, force: true });
    await db?.$disconnect();
  });

  it("refuses a wrong API key before saving anything", async () => {
    await expect(C.addImmich(db, { name: "Home", url: mock.url, apiKey: "wrong-key-123" })).rejects.toMatchObject({ code: "remote" });
    expect(await db.connection.count()).toBe(0);
  });

  it("brings in the albums, unselected, and keeps the key encrypted", async () => {
    const id = await C.addImmich(db, { name: "Home", url: mock.url, apiKey: IMMICH_KEY });
    expect((await db.connection.findUniqueOrThrow({ where: { id } })).secret).not.toContain(IMMICH_KEY);
    const albums = await db.photoAlbum.findMany({ where: { connectionId: id }, orderBy: { name: "asc" } });
    expect(albums.map((a) => [a.name, a.selected, a.server])).toEqual([["Kids", false, "Home"], ["Summer", false, "Home"]]);
  });

  it("an album joining the rotation brings its photos, without videos", async () => {
    const summer = await db.photoAlbum.findFirstOrThrow({ where: { name: "Summer" } });
    await db.photoAlbum.updateMany({ where: { connectionId: null }, data: { selected: false } }); // leave the demo's albums out
    await updateAlbum(db, { id: summer.id, selected: true, weight: 50 });
    await albumSelected(db, summer.id);
    const photos = await db.photoAsset.findMany({ where: { albumId: summer.id }, orderBy: { remoteId: "asc" } });
    expect(photos.map((p) => p.remoteId)).toEqual(["a1", "a2"]);
    expect(photos[0].place).toBe("Rügen, Germany");
    const playlist = await photoPlaylist(db);
    expect(playlist.every((p) => p.src?.startsWith("/api/photos/"))).toBe(true);
  });

  it("proxies thumbnails through the disk cache", async () => {
    const photo = await db.photoAsset.findFirstOrThrow({ where: { remoteId: "a1" } });
    const cache = diskCache(cacheDir, 10_000_000);
    const before = mock.stats.thumbnails;
    const first = await getPhoto(db, photo.id, "preview", cache);
    const second = await getPhoto(db, photo.id, "preview", cache);
    expect(first.type).toBe("image/jpeg");
    expect(second.body.equals(first.body)).toBe(true);
    expect(mock.stats.thumbnails - before).toBe(1);
    // Demo photos are drawn on the device, so the proxy has nothing for them.
    const demo = await db.photoAsset.findFirstOrThrow({ where: { remoteId: null } });
    await expect(getPhoto(db, demo.id, "preview", cache)).rejects.toMatchObject({ code: "notFound" });
  });
});
