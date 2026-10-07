import type { Photo, PhotoAlbum } from "../types";
import { PHOTOS, PHOTO_SERVERS } from "../data/photos";

/**
 * Photo seam. Several Immich servers can be connected; albums from all of
 * them form one weighted pool.
 *
 * Future ImmichAdapter (one instance per server, API key stored server-side):
 *   GET /api/albums                → list albums
 *   GET /api/albums/{id}           → asset ids
 *   GET /api/assets/{id}/thumbnail?size=preview → image, proxied by our backend
 * EXIF date/location come from the asset's exifInfo.
 */
export interface PhotoAdapter {
  serverId: string;
  listAlbums(): Promise<Pick<PhotoAlbum, "id" | "name" | "count">[]>;
  listPhotos(albumId: string, limit: number): Promise<Photo[]>;
}

export const getServers = () => PHOTO_SERVERS;

/** Weighted shuffle across selected albums – the screensaver's playlist. Empty when nothing is selected. */
export function buildPool(albums: PhotoAlbum[]): Photo[] {
  const selected = albums.filter((a) => a.selected);
  if (!selected.length) return [];
  const total = selected.reduce((s, a) => s + Math.max(a.weight, 1), 0);
  const out: Photo[] = [];
  for (const a of selected) {
    const share = Math.max(1, Math.round((Math.max(a.weight, 1) / total) * 12));
    const own = PHOTOS.filter((p) => p.albumId === a.id);
    const src = own.length ? own : PHOTOS;
    for (let i = 0; i < share; i++) out.push({ ...src[i % src.length], albumId: a.id, id: `${a.id}-${i}` });
  }
  return out.sort((x, y) => ((x.seed * 9301 + 49297) % 233) - ((y.seed * 9301 + 49297) % 233));
}
