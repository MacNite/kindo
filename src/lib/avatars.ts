import type { Member, Period } from "./types";

/** Avatar choices: friendly animals first, then a few favourite things. Kept apart from task pictures. */
export const AVATAR_EMOJI = [
  "🦊", "🐻", "🦄", "🐴", "🦖", "🐼", "🐸", "🦁", "🐯", "🐨", "🐰", "🐶", "🐱", "🐵", "🐷", "🐧",
  "🦒", "🐘", "🦔", "🐙", "🦉", "🐝", "🦋", "🐞", "🐢", "🐬", "🐳", "🐉",
  "🌻", "🌸", "🌈", "⭐", "🚀", "🚒", "⚽", "🎸", "🍓", "👑",
];

/**
 * The short animations an avatar plays when a child finishes a routine (D60).
 * Each is a CSS keyframe set in `src/app/celebration.css`, shared by every avatar
 * it suits: a frog and a rabbit both hop.
 */
export const MOTIONS = [
  "stomp", "roar", "hatch", "gallop", "rear", "jump", "toss", "hop",
  "wiggle", "spin", "peek", "fly", "swim", "launch", "drive",
] as const;
export type Motion = (typeof MOTIONS)[number];

type Moves = readonly [Motion, Motion, Motion];

/**
 * Three motions per avatar, and the whole animal where the avatar emoji is only
 * its head (🐴 → 🐎). Emoji not listed here, photos and initials hop, spin and wiggle.
 */
const FIGURES: Record<string, { body?: string; moves: Moves }> = {
  "🦊": { moves: ["peek", "hop", "wiggle"] },
  "🐻": { moves: ["stomp", "roar", "wiggle"] },
  "🦄": { moves: ["toss", "spin", "hop"] },
  "🐴": { body: "🐎", moves: ["gallop", "rear", "jump"] },
  "🦖": { moves: ["stomp", "roar", "hatch"] },
  "🐼": { moves: ["wiggle", "peek", "spin"] },
  "🐸": { moves: ["hop", "peek", "swim"] },
  "🦁": { moves: ["roar", "toss", "stomp"] },
  "🐯": { body: "🐅", moves: ["gallop", "roar", "hop"] },
  "🐨": { moves: ["peek", "wiggle", "spin"] },
  "🐰": { body: "🐇", moves: ["hop", "gallop", "peek"] },
  "🐶": { body: "🐕", moves: ["gallop", "jump", "wiggle"] },
  "🐱": { body: "🐈", moves: ["peek", "gallop", "spin"] },
  "🐵": { body: "🐒", moves: ["wiggle", "spin", "hop"] },
  "🐷": { body: "🐖", moves: ["wiggle", "gallop", "peek"] },
  "🐧": { moves: ["wiggle", "hatch", "swim"] },
  "🦒": { moves: ["toss", "wiggle", "peek"] },
  "🐘": { moves: ["stomp", "roar", "wiggle"] },
  "🦔": { moves: ["spin", "peek", "hop"] },
  "🐙": { moves: ["swim", "wiggle", "spin"] },
  "🦉": { moves: ["fly", "peek", "hatch"] },
  "🐝": { moves: ["fly", "wiggle", "spin"] },
  "🦋": { moves: ["fly", "spin", "hop"] },
  "🐞": { moves: ["fly", "peek", "wiggle"] },
  "🐢": { moves: ["peek", "swim", "hatch"] },
  "🐬": { moves: ["swim", "spin", "hop"] },
  "🐳": { moves: ["swim", "wiggle", "hop"] },
  "🐉": { moves: ["fly", "roar", "hatch"] },
  "🌻": { moves: ["wiggle", "spin", "peek"] },
  "🚀": { moves: ["launch", "spin", "hop"] },
  "🚒": { moves: ["drive", "hop", "wiggle"] },
};
const FALLBACK: Moves = ["hop", "spin", "wiggle"];

/** How many cheers there are per time of day (`kids.cheers.<period>.c1` …). */
export const CHEER_COUNT = 7;

export type Celebration = {
  motion: Motion;
  /** The emoji that moves: the whole animal where there is one. Null for photos and initials. */
  figure: string | null;
  /** True when the figure is the whole animal in place of the avatar's head. */
  body: boolean;
  /** 1-based cheer for the period. */
  cheer: number;
};

const bare = (emoji: string) => emoji.replace(/\uFE0F/g, "");

/** A small, stable string hash (FNV-1a), so the pick needs no storage. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Days since the epoch for a `YYYY-MM-DD` key. */
const dayNumber = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/**
 * What a finished routine shows. The same child, day and period always get the
 * same animation and cheer, so a reload changes nothing; both move on by one
 * each day, so tomorrow never repeats today.
 */
export function celebrationFor(member: Pick<Member, "id" | "avatar">, day: string, period: Period): Celebration {
  const emoji = member.avatar.kind === "emoji" ? bare(member.avatar.value) : null;
  const known = emoji ? FIGURES[emoji] : undefined;
  const moves = known?.moves ?? FALLBACK;
  const n = dayNumber(day);
  return {
    motion: moves[(n + hash(`${member.id}:${period}:motion`)) % moves.length],
    figure: emoji ? known?.body ?? emoji : null,
    body: !!known?.body,
    cheer: ((n + hash(`${member.id}:${period}:cheer`)) % CHEER_COUNT) + 1,
  };
}
