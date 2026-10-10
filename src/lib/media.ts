/**
 * Listening (§23): the kids' shelf of albums, playlists and audiobooks from
 * Jellyfin and Audiobookshelf, played on the screen itself or on a speaker
 * from Home Assistant. Pure helpers shared by the server and the screens.
 */

export type MediaSource = "jellyfin" | "audiobookshelf";
export type ShelfKind = "album" | "playlist" | "book";

/**
 * Something the admin put on the shelf, as stored on its connection. Kindo's
 * own id goes to the screens; the server's id stays on the server.
 */
export interface ShelfItem {
  id: string;
  remoteId: string;
  kind: ShelfKind;
  /** What the family sees; the server's title unless the admin changed it. */
  name: string;
  /** Whose shelf it is on; empty for every child. */
  memberIds: string[];
}

/** What every screen may know about a shelf item. */
export interface ShelfEntry {
  id: string;
  kind: ShelfKind;
  name: string;
  memberIds: string[];
  source: MediaSource;
}

/** A speaker from Home Assistant the admin picked, with how loud a tap may make it (0 to 100). */
export interface Speaker { entityId: string; name: string; maxVolume: number }

/** Listening as the screens see it; null when nothing is on the shelf. */
export interface MediaSetup {
  shelf: ShelfEntry[];
  speakers: { entityId: string; name: string }[];
}

/** One file of an item, in seconds; `start` is where it begins in the whole item. */
export interface Track { title: string; duration: number; start: number }

/** What a screen needs to play an item: its files and where to start. */
export interface Queue {
  itemId: string;
  tracks: Track[];
  /** Seconds into the whole item: an audiobook's saved place, otherwise 0. */
  position: number;
  /** An audiobook: the place is saved while it plays. */
  resumable: boolean;
}

/** Something on a media server, for the admin to pick. */
export interface MediaChoice { remoteId: string; kind: ShelfKind; name: string; detail?: string }

/** A speaker as it is now. `volume` is 0 to 100. */
export interface SpeakerState {
  entityId: string;
  name: string;
  state: "playing" | "paused" | "idle" | "off" | "unavailable";
  title?: string;
  volume?: number;
  maxVolume: number;
}

/** What of the kids' shelf needs the settings PIN to start on a wall (D64): nothing, speakers, or everything. */
export type MediaPin = "off" | "speakers" | "all";

/**
 * Whether starting playback here needs someone who may manage (an adult, or
 * a wall unlocked with the PIN). Pausing, stopping and the volume never do.
 */
export const startNeedsPin = (mode: MediaPin, where: "screen" | "speaker") => mode === "all" || (mode === "speakers" && where === "speaker");

/** At most this many items on one connection's shelf. */
export const MAX_SHELF = 48;
/** At most this many speakers. */
export const MAX_SPEAKERS = 8;
/** An audiobook's place is saved this often while it plays, and when it stops. */
export const PROGRESS_EVERY_MS = 30_000;

/** The shelf one child sees: what is for everyone and what is for them. Without a child, everything. */
export function shelfFor<T extends { memberIds: string[] }>(shelf: readonly T[], memberId?: string | null): T[] {
  if (!memberId) return [...shelf];
  return shelf.filter((s) => !s.memberIds.length || s.memberIds.includes(memberId));
}

/** Track starts from their lengths. */
export function withStarts(tracks: readonly { title: string; duration: number }[]): Track[] {
  let start = 0;
  return tracks.map((t) => {
    const d = Number.isFinite(t.duration) && t.duration > 0 ? t.duration : 0;
    const track = { title: t.title, duration: d, start };
    start += d;
    return track;
  });
}

export const totalOf = (tracks: readonly Track[]) => tracks.reduce((s, t) => s + t.duration, 0);

/** Which track a place in the whole item falls in, and how far into it. */
export function trackAt(tracks: readonly Track[], position: number): { index: number; offset: number } {
  if (!tracks.length) return { index: 0, offset: 0 };
  const p = Math.max(0, position);
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (p < t.start + t.duration || i === tracks.length - 1) return { index: i, offset: Math.min(Math.max(0, p - t.start), t.duration || Infinity) };
  }
  return { index: 0, offset: 0 };
}

/** At the very end: the last 15 seconds, or less of a short item (the credits, a pause after the last word). */
export const isFinished = (position: number, total: number) => total > 0 && position >= total - Math.min(15, total * 0.02);

/** A finished audiobook starts again from the beginning. */
export function resumeAt(position: number, total: number): number {
  if (!Number.isFinite(position) || position <= 0) return 0;
  return isFinished(position, total) ? 0 : position;
}

/** A volume for a speaker: 0 to 100, never above what the admin allowed. */
export const clampVolume = (volume: number, max: number) => Math.round(Math.min(Math.max(0, volume), Math.max(0, Math.min(100, max))));

/** Home Assistant's media player state, in Kindo's words. */
export function speakerStateOf(state: string | undefined): SpeakerState["state"] {
  switch (state) {
    case "playing": case "paused": case "idle": case "off": return state;
    case "buffering": return "playing";
    case "on": case "standby": return "idle";
    default: return "unavailable";
  }
}

export const isMediaPlayer = (entityId: string) => entityId.startsWith("media_player.");

// ── Talking to Home Assistant (§24) ─────────────────────────────────────────
/** Home Assistant's speech-to-text takes 16 kHz, 16-bit mono PCM. */
export const VOICE_SAMPLE_RATE = 16_000;
/** A command is short; a held button stops recording after this. */
export const MAX_VOICE_SECONDS = 12;
export const MAX_VOICE_BYTES = VOICE_SAMPLE_RATE * 2 * MAX_VOICE_SECONDS;

/** What Home Assistant understood and answered. `audio` is its spoken answer, when it has one. */
export interface AssistReply { heard: string; answer: string; audio?: { type: string; data: string } }

/**
 * The microphone's samples (-1…1, at the browser's rate) as 16 kHz signed
 * 16-bit little-endian PCM. Averages the samples that fall into each output
 * sample, which is enough of a low-pass for speech.
 */
export function toPcm16(input: Float32Array, inputRate: number, outputRate = VOICE_SAMPLE_RATE): Int16Array {
  if (!input.length || inputRate <= 0) return new Int16Array(0);
  const ratio = inputRate / outputRate;
  const n = Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.max(from + 1, Math.min(input.length, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = from; j < to; j++) sum += input[j];
    const s = Math.max(-1, Math.min(1, sum / (to - from)));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}
