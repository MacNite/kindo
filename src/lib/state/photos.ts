"use client";
import { useEffect, useRef, useState } from "react";
import type { Photo } from "../types";
import { getPhotoPlaylist } from "../services/actions";
import { useStore } from "./store";

/**
 * The photo frame's playlist, drawn by the server from the selected albums
 * (§13). Redrawn when the album selection or weights change.
 */
export function usePhotoPlaylist(): Photo[] {
  const { albums } = useStore();
  const [photos, setPhotos] = useState<Photo[]>([]);
  // The count changes when a newly selected album's photos arrive: draw again then too.
  const key = albums.map((a) => `${a.id}:${a.selected ? `${a.weight}:${a.count}` : "-"}`).join(",");
  useEffect(() => {
    let live = true;
    getPhotoPlaylist().then((p) => live && setPhotos(p)).catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);
  return photos;
}

/**
 * The photo shown now, one step every `interval` ms. While the last photo of
 * a playlist shows, the next one is drawn, so a frame left on all evening
 * doesn't go round the same photos again (D76). If that draw fails, the
 * playlist starts over.
 */
export function usePhotoFrame(interval: number): Photo | undefined {
  const drawn = usePhotoPlaylist();
  const [show, setShow] = useState({ list: drawn, i: 0 });
  const next = useRef<Photo[] | null>(null);
  useEffect(() => {
    setShow({ list: drawn, i: 0 });
  }, [drawn]);
  const { list, i } = show;

  useEffect(() => {
    next.current = null;
    if (list.length < 2 || i !== list.length - 1) return;
    let live = true;
    getPhotoPlaylist().then((p) => {
      if (!live) return;
      // Don't show the photo on screen twice in a row.
      next.current = p.length > 1 && p[0].id === list[i].id ? [...p.slice(1), p[0]] : p;
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [list, i]);

  useEffect(() => {
    if (list.length < 2) return;
    const id = setInterval(() => {
      const fresh = next.current;
      setShow((s) => (s.i + 1 < s.list.length ? { ...s, i: s.i + 1 } : fresh?.length ? { list: fresh, i: 0 } : { ...s, i: 0 }));
    }, interval);
    return () => clearInterval(id);
  }, [list, interval]);

  return list[i];
}
