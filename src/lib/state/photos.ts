"use client";
import { useEffect, useState } from "react";
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
