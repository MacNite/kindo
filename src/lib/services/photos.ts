import type { Photo, PhotoAlbum } from "../types";

/**
 * The photo frame's playlist (§13). Albums from every server form one pool;
 * each selected album gets a share of the slots by its weight (at least one),
 * and the result is shuffled. Pure: the server calls it with the albums'
 * photos and its own random source.
 */
export function weightedPlaylist(albums: PhotoAlbum[], photosOf: (albumId: string) => Photo[], size = 48, random = Math.random): Photo[] {
  const selected = albums.filter((a) => a.selected && photosOf(a.id).length);
  if (!selected.length) return [];
  const total = selected.reduce((s, a) => s + Math.max(a.weight, 1), 0);
  const out: Photo[] = [];
  for (const a of selected) {
    const share = Math.max(1, Math.round((Math.max(a.weight, 1) / total) * size));
    const own = shuffle([...photosOf(a.id)], random);
    for (let i = 0; i < Math.min(share, own.length); i++) out.push(own[i]);
  }
  return shuffle(out, random);
}

function shuffle<T>(xs: T[], random: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}
