import type { Photo as PhotoT } from "@/lib/types";

/**
 * Stand-in for Immich thumbnails in the demo: calm, procedurally drawn
 * landscapes, so the demo needs no network and no stock photos of strangers.
 */
const PALETTES = [
  { sky: ["#F6D7B0", "#E9A98B"], sun: "#FFF1D6", hills: ["#B97A6A", "#8C5A58", "#5E3E46"] }, // dusk
  { sky: ["#CFE6EE", "#9CC7D8"], sun: "#FFFFFF", hills: ["#7FA89A", "#4F7D73", "#2F574F"] }, // coast
  { sky: ["#E8EED8", "#C4D8B0"], sun: "#FDFBEA", hills: ["#8DAF6E", "#5D8A4E", "#3B6338"] }, // meadow
  { sky: ["#DCE3F1", "#AFC0DE"], sun: "#F7F9FF", hills: ["#9AA7C2", "#6B7AA0", "#465476"] }, // alpine
  { sky: ["#F4E2C6", "#E7BE8A"], sun: "#FFF6E3", hills: ["#C98B4F", "#A0633A", "#6E4430"] }, // autumn
  { sky: ["#E9DDF0", "#C9B4DA"], sun: "#FFF8FF", hills: ["#9C86B5", "#73608F", "#4D4069"] }, // lavender
];

function rand(seed: number) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function PhotoPlaceholder({ seed, className }: { seed: number; className?: string }) {
  const r = rand(seed * 97 + 13);
  const p = PALETTES[seed % PALETTES.length];
  const sunX = 300 + r() * 1000, sunY = 220 + r() * 220;
  const ridge = (base: number, amp: number) => {
    const pts: string[] = [];
    const phase = r() * 6, freq = 0.002 + r() * 0.003;
    for (let x = 0; x <= 1600; x += 40) pts.push(`${x},${(base + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase) * amp * 0.35).toFixed(1)}`);
    return `M0,1000 L${pts.join(" L")} L1600,1000 Z`;
  };
  const id = `g${seed}`;
  return (
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} /><stop offset="1" stopColor={p.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill={`url(#${id})`} />
      <circle cx={sunX} cy={sunY} r={70 + r() * 50} fill={p.sun} opacity="0.85" />
      <path d={ridge(560, 70)} fill={p.hills[0]} opacity="0.9" />
      <path d={ridge(690, 60)} fill={p.hills[1]} />
      <path d={ridge(830, 45)} fill={p.hills[2]} />
    </svg>
  );
}

/** A photo from the rotation: the proxied image, or the demo's drawn landscape. */
export function Photo({ photo, className, size = "preview" }: { photo: PhotoT; className?: string; size?: "preview" | "thumbnail" }) {
  if (photo.src) return <img src={`${photo.src}?size=${size}`} alt="" loading="lazy" decoding="async" className={`${className ?? ""} object-cover`} />;
  return <PhotoPlaceholder seed={photo.seed ?? 0} className={className} />;
}
