"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useNow } from "@/lib/useNow";
import { usePhotoPlaylist } from "@/lib/state/photos";
import { useNight } from "@/lib/state/useNight";
import { FramedPhoto } from "./FramedPhoto";

/** Full-screen photo frame; plain black during the night rest (D57). Any touch calls onWake. */
export function Screensaver({ onWake, interval = 9000 }: { onWake: () => void; interval?: number }) {
  const { albums, showPhotoMeta } = useStore();
  const { t, fmt } = useI18n();
  const now = useNow(10_000);
  const pool = usePhotoPlaylist();
  const night = useNight();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (pool.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % pool.length), interval);
    return () => clearInterval(id);
  }, [pool.length, interval]);
  // No albums selected → clock on black, no photos.
  const photo = pool.length ? pool[i % pool.length] : undefined;
  const album = photo && albums.find((a) => a.id === photo.albumId);

  // Night rest: nothing lit, so the screen can go dark (§13, D57).
  if (night) return <div role="button" tabIndex={0} aria-label={t("photos.wake")} onClick={onWake} onKeyDown={onWake} data-night className="fixed inset-0 z-[100] cursor-pointer bg-black" />;

  return (
    <div role="button" tabIndex={0} aria-label={t("photos.wake")} onClick={onWake} onKeyDown={onWake}
      className="fixed inset-0 z-[100] cursor-pointer overflow-hidden bg-black text-white">
      {/* Keyed so each photo fades in over the previous one */}
      {photo && (
        <div key={photo.id} className="absolute inset-0 animate-fade">
          <FramedPhoto photo={photo} motion="animate-[kenburns_20s_ease-out_both]" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 bg-gradient-to-t from-black/50 via-black/10 to-transparent p-10">
        <div>
          <p className="num font-display text-7xl font-semibold leading-none tracking-tight">{fmt.clock(now)}</p>
          <p className="mt-2 text-xl opacity-90">{fmt.dateLong(now)}</p>
        </div>
        {photo && showPhotoMeta && (
          <div className="text-right text-lg">
            {photo.place && <p className="font-bold">{photo.place}</p>}
            <p className="opacity-85">{photo.takenAt && `${fmt.dateMedium(photo.takenAt)} ${photo.takenAt.getFullYear()}, `}{album?.name}</p>
          </div>
        )}
      </div>
      <style>{`@keyframes kenburns{from{transform:scale(1.08)}to{transform:scale(1)}}`}</style>
    </div>
  );
}
