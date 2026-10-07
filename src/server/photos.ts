import type { Photo, PhotoAlbum } from "@/lib/types";
import { weightedPlaylist } from "@/lib/services/photos";
import type { Tx } from "./db";

/** How many photos one album may contribute to a playlist draw. */
const PER_ALBUM = 200;

/** A fresh weighted playlist for the photo frame (§13). */
export async function photoPlaylist(db: Tx, size = 48): Promise<Photo[]> {
  const albums = await db.photoAlbum.findMany({ where: { selected: true } });
  const byAlbum = new Map<string, Photo[]>();
  for (const a of albums) {
    // A random slice per album, so big albums don't always start with the same photos.
    const rows = await db.$queryRaw<{ id: string; takenAt: Date | null; place: string | null; seed: number | null }[]>`
      SELECT id, "takenAt", place, seed FROM "PhotoAsset" WHERE "albumId" = ${a.id} ORDER BY random() LIMIT ${PER_ALBUM}`;
    byAlbum.set(a.id, rows.map((r) => toPhoto(a.id, r)));
  }
  const list: PhotoAlbum[] = albums.map((a) => ({ id: a.id, server: a.server, name: a.name, count: a.count, selected: a.selected, weight: a.weight }));
  return weightedPlaylist(list, (id) => byAlbum.get(id) ?? [], size);
}

function toPhoto(albumId: string, r: { id: string; takenAt: Date | null; place: string | null; seed: number | null }): Photo {
  return {
    id: r.id, albumId, takenAt: r.takenAt ?? undefined, place: r.place ?? undefined,
    ...(r.seed !== null ? { seed: r.seed } : { src: `/api/photos/${r.id}` }),
  };
}
