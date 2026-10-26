import type { Photo, PhotoAlbum } from "../types";

/**
 * The photo frame's playlist (§13). Albums from every server form one pool;
 * each selected album gets a share of the slots by its weight (at least one),
 * and the result is shuffled. Slots an album has no photos for go to the
 * others, again by weight (D76). Pure: the server calls it with the albums'
 * photos and its own random source.
 */
export function weightedPlaylist(albums: PhotoAlbum[], photosOf: (albumId: string) => Photo[], size = 48, random = Math.random): Photo[] {
  const selected = albums.filter((a) => a.selected && photosOf(a.id).length)
    .map((a) => ({ own: shuffle([...photosOf(a.id)], random), weight: Math.max(a.weight, 1), n: 0 }));
  if (!selected.length) return [];
  const total = selected.reduce((s, x) => s + x.weight, 0);
  for (const x of selected) x.n = Math.min(x.own.length, Math.max(1, Math.round((x.weight / total) * size)));
  let left = size - selected.reduce((s, x) => s + x.n, 0);
  while (left > 0) {
    const open = selected.filter((x) => x.n < x.own.length);
    if (!open.length) break;
    const weight = open.reduce((s, x) => s + x.weight, 0);
    let given = 0;
    for (const x of open) {
      const add = Math.min(x.own.length - x.n, Math.floor((x.weight / weight) * left));
      x.n += add;
      given += add;
    }
    // Fewer slots left than albums to share them: one each, heaviest first.
    if (!given) for (const x of [...open].sort((p, q) => q.weight - p.weight)) if (given < left) { x.n++; given++; }
    left -= given;
  }
  return shuffle(selected.flatMap((x) => x.own.slice(0, x.n)), random);
}

function shuffle<T>(xs: T[], random: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}
