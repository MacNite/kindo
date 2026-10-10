"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Photo as PhotoT } from "@/lib/types";
import { photoFit, type PhotoFit } from "@/lib/photoFit";
import { Photo } from "../ui/PhotoPlaceholder";

/**
 * A photo filling its (positioned) parent, as the photo frame shows it: cropped
 * to fill while little is lost, otherwise whole over a blurred copy of itself
 * (portrait photos on a landscape screen, panoramas). `motion` animates the
 * photo only, so the blurred backdrop stays still and cheap.
 */
export function FramedPhoto({ photo, motion = "" }: { photo: PhotoT; motion?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  // Unknown until the image has loaded; hidden till then, so it doesn't jump from cropped to whole.
  const [fit, setFit] = useState<PhotoFit>();
  const measure = useCallback(() => {
    const i = img.current, b = box.current;
    if (!i || !b || !i.complete || !i.naturalWidth) return;
    setFit(photoFit({ width: i.naturalWidth, height: i.naturalHeight }, { width: b.clientWidth, height: b.clientHeight }));
  }, []);
  useEffect(() => {
    measure(); // a cached image may have loaded before React listened
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  if (!photo.src) return <div className={`absolute inset-0 ${motion}`}><Photo photo={photo} className="h-full w-full" /></div>;
  const src = `${photo.src}?size=preview`;
  return (
    <div ref={box} className="absolute inset-0">
      {fit === "contain" && <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl" />}
      <div className={`absolute inset-0 ${motion}`}>
        <img ref={img} src={src} alt="" decoding="async" onLoad={measure}
          className={`h-full w-full transition-opacity duration-700 ${fit === "contain" ? "object-contain" : "object-cover"} ${fit ? "" : "opacity-0"}`} />
      </div>
    </div>
  );
}
