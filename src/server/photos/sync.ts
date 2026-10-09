import { join } from "node:path";
import type { Connection, PhotoAlbum } from "@prisma/client";
import type { Tx } from "../db";
import { decryptSecret } from "../crypto";
import { env } from "../env";
import { notFound } from "../errors";
import { errorMessage, log } from "../log";
import { diskCache, type DiskCache } from "./cache";
import { fetchThumbnail, listAlbums, listAssets, type ImmichServer, type ThumbSize } from "./immich";

/** Albums and their photo lists are refreshed this often; the images themselves are fetched on demand. */
const PHOTO_SYNC_MINUTES = 30;

const immichServer = (c: Connection): ImmichServer => ({ url: c.url ?? "", apiKey: c.secret ? decryptSecret(c.secret) : "" });

/** Refreshes one album's photo list. */
async function syncAssets(db: Tx, conn: Connection, album: PhotoAlbum) {
  const assets = await listAssets(immichServer(conn), album.remoteId!);
  const keep = new Set(assets.map((a) => a.id));
  await db.photoAsset.deleteMany({ where: { albumId: album.id, OR: [{ remoteId: null }, { remoteId: { notIn: [...keep] } }] } });
  await db.photoAsset.createMany({
    data: assets.map((a) => ({ albumId: album.id, remoteId: a.id, takenAt: a.takenAt ?? null, place: a.place ?? null })),
    skipDuplicates: true,
  });
  await db.photoAlbum.update({ where: { id: album.id }, data: { count: assets.length, syncedAt: new Date() } });
}

/**
 * Refreshes a server's albums (new ones appear unselected, gone ones go)
 * and the photo lists of the albums in the rotation.
 */
export async function syncPhotos(db: Tx, conn: Connection, now = new Date()) {
  try {
    const remote = await listAlbums(immichServer(conn));
    const ids = remote.map((a) => a.id);
    await db.photoAlbum.deleteMany({ where: { connectionId: conn.id, remoteId: { notIn: ids } } });
    for (const a of remote) {
      await db.photoAlbum.upsert({
        where: { connectionId_remoteId: { connectionId: conn.id, remoteId: a.id } },
        create: { connectionId: conn.id, remoteId: a.id, server: conn.name, name: a.name, count: a.count },
        update: { server: conn.name, name: a.name, count: a.count },
      });
    }
    for (const album of await db.photoAlbum.findMany({ where: { connectionId: conn.id, selected: true } })) await syncAssets(db, conn, album);
    await db.connection.update({ where: { id: conn.id }, data: { status: "ok", lastError: null, lastSyncAt: now } });
  } catch (e) {
    await db.connection.update({ where: { id: conn.id }, data: { status: "error", lastError: errorMessage(e).slice(0, 500), lastSyncAt: now } });
    log.warn("photo sync failed", { connection: conn.id, error: errorMessage(e) });
    throw e;
  }
}

export async function duePhotoConnections(db: Tx, now = new Date()) {
  const before = new Date(now.getTime() - PHOTO_SYNC_MINUTES * 60_000);
  return db.connection.findMany({ where: { kind: "immich", OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: before } }] } });
}

/** An album just joined the rotation: fetch its photo list now rather than at the next sync. */
export async function albumSelected(db: Tx, albumId: string) {
  const album = await db.photoAlbum.findUnique({ where: { id: albumId }, include: { connection: true, _count: { select: { photos: true } } } });
  if (!album?.connection || !album.selected || album._count.photos > 0) return;
  await syncAssets(db, album.connection, album).catch((e) => log.warn("album sync failed", { album: albumId, error: errorMessage(e) }));
}

// ── The proxy (§13): images reach devices only through Kindo ────────────────
let cache: DiskCache | undefined;
function photoCache() {
  const e = env();
  return (cache ??= diskCache(join(e.cacheDir, "photos"), e.KINDO_PHOTO_CACHE_MB * 1024 * 1024));
}

export async function getPhoto(db: Tx, assetId: string, size: ThumbSize, c: DiskCache = photoCache()) {
  // Kindo still has to know the photo: one removed from its album (or its server) isn't served from the cache either.
  const asset = await db.photoAsset.findUnique({ where: { id: assetId }, include: { album: { include: { connection: true } } } });
  if (!asset?.remoteId || !asset.album.connection) throw notFound("photo");
  const key = `${assetId}-${size}`;
  const hit = await c.get(key);
  if (hit) return hit;
  const img = await fetchThumbnail(immichServer(asset.album.connection), asset.remoteId, size);
  // A cache that can't be written (a volume the app user doesn't own) costs a refetch next time, not the photo.
  await c.put(key, img.body).catch((e) => log.warn("photo cache write failed", { dir: env().cacheDir, error: errorMessage(e) }));
  return img;
}
