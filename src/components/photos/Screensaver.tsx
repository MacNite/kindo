"use client";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useNow } from "@/lib/useNow";
import { buildPool } from "@/lib/services/photos";
import { ALBUMS } from "@/lib/data/photos";
import { PhotoPlaceholder } from "../ui/PhotoPlaceholder";

/** Full-screen photo frame. Any touch calls onWake. */
export function Screensaver({ onWake, interval = 9000 }: { onWake: () => void; interval?: number }) {
  const { albums } = useStore();
  const { t, fmt } = useI18n();
  const now = useNow(10_000);
  const pool = useMemo(() => buildPool(albums), [albums]);
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % pool.length), interval);
    return () => clearInterval(id);
  }, [pool.length, interval]);
  const photo = pool[i];
  const album = ALBUMS.find((a) => a.id === photo.albumId);

  return (
    <div role="button" tabIndex={0} aria-label={t("photos.wake")} onClick={onWake} onKeyDown={onWake}
      className="fixed inset-0 z-[100] cursor-pointer overflow-hidden bg-black text-white">
      {/* Keyed so each photo fades in over the previous one */}
      <div key={photo.id} className="absolute inset-0 animate-fade">
        <div className="absolute inset-0 animate-[kenburns_20s_ease-out_both]">
          <PhotoPlaceholder seed={photo.seed} className="h-full w-full" />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 bg-gradient-to-t from-black/50 via-black/10 to-transparent p-10">
        <div>
          <p className="num font-display text-7xl font-semibold leading-none tracking-tight">{fmt.clock(now)}</p>
          <p className="mt-2 text-xl opacity-90">{fmt.dateLong(now)}</p>
        </div>
        <div className="text-right text-lg">
          <p className="font-bold">{photo.place}</p>
          <p className="opacity-85">{fmt.dateMedium(photo.takenAt)} {photo.takenAt.getFullYear()}, {album?.name}</p>
        </div>
      </div>
      <style>{`@keyframes kenburns{from{transform:scale(1.08)}to{transform:scale(1)}}`}</style>
    </div>
  );
}
