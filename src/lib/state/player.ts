"use client";
import { useSyncExternalStore } from "react";
import { PROGRESS_EVERY_MS, totalOf, trackAt, type Queue, type ShelfEntry } from "../media";
import { mediaQueue, saveMediaProgress } from "../services/media";

/**
 * The screen's own player for the kids' shelf (§23). One per browser tab, kept
 * outside React so the music carries on from page to page (the wall, the
 * child's view, Settings) and a mini player anywhere can show it. Sound comes
 * through Kindo (`/api/media/<item>/<file>`); an audiobook's place is saved
 * every half minute and whenever it stops. The device remembers what played
 * and where for 12 hours, so after a reload or a restarted browser it comes
 * back paused, one tap from carrying on (§20 D73).
 */
export interface PlayerState {
  item: ShelfEntry | null;
  /** Who is listening: their own place in an audiobook (§20 D61). */
  memberId?: string;
  queue: Queue | null;
  index: number;
  /** Seconds into the whole item. */
  position: number;
  duration: number;
  playing: boolean;
  loading: boolean;
  error?: string;
}

const IDLE: PlayerState = { item: null, queue: null, index: 0, position: 0, duration: 0, playing: false, loading: false };
let state: PlayerState = IDLE;
const listeners = new Set<() => void>();
let audio: HTMLAudioElement | null = null;
let lastSaved = 0;
/** The latest start: an older one answering late doesn't take over. */
let ticket = 0;

/** What this device played and where, kept across reloads (D73). */
const KEPT = "kindo.player";
const KEEP_MS = 12 * 60 * 60_000;
const KEEP_EVERY_MS = 5_000;
interface Kept { item: ShelfEntry; memberId?: string; index: number; position: number; duration: number; at: number }
let lastKept = 0;

function keep(now = false) {
  if (typeof window === "undefined" || (!now && Date.now() - lastKept < KEEP_EVERY_MS)) return;
  lastKept = Date.now();
  try {
    if (!state.item) localStorage.removeItem(KEPT);
    else {
      const kept: Kept = { item: state.item, memberId: state.memberId, index: state.index, position: state.position, duration: state.duration, at: Date.now() };
      localStorage.setItem(KEPT, JSON.stringify(kept));
    }
  } catch {
    // No storage (a private window): it just isn't kept.
  }
}

let restored = false;
/** Once per page load: what this device played before, paused, unless it is older than 12 hours. */
function restore() {
  if (restored || typeof window === "undefined") return;
  restored = true;
  if (state.item) return;
  try {
    const k = JSON.parse(localStorage.getItem(KEPT) ?? "null") as Kept | null;
    if (!k?.item?.id || !(Date.now() - k.at < KEEP_MS)) {
      localStorage.removeItem(KEPT);
      return;
    }
    set({ item: k.item, memberId: k.memberId, index: k.index || 0, position: k.position || 0, duration: k.duration || 0 });
  } catch {
    // Unreadable: start empty.
  }
}

function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
  keep();
  listeners.forEach((l) => l());
}

const fileUrl = (itemId: string, index: number) => `/api/media/${itemId}/${index}`;
export const coverUrl = (itemId: string) => `/api/media/${itemId}/cover`;

function element(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.addEventListener("timeupdate", () => {
    const q = state.queue;
    if (!q || !audio) return;
    set({ position: (q.tracks[state.index]?.start ?? 0) + audio.currentTime });
    if (state.playing && Date.now() - lastSaved > PROGRESS_EVERY_MS) void saveProgress();
  });
  audio.addEventListener("playing", () => set({ playing: true, loading: false, error: undefined }));
  audio.addEventListener("pause", () => {
    set({ playing: false });
    keep(true);
    void saveProgress();
  });
  audio.addEventListener("waiting", () => set({ loading: true }));
  audio.addEventListener("ended", () => {
    if (state.queue && state.index < state.queue.tracks.length - 1) void loadTrack(state.index + 1, 0, true);
    else {
      set({ playing: false, position: state.duration });
      void saveProgress();
    }
  });
  audio.addEventListener("error", () => set({ playing: false, loading: false, error: "remote" }));
  return audio;
}

async function saveProgress() {
  const q = state.queue;
  if (!q?.resumable || !state.item) return;
  lastSaved = Date.now();
  await saveMediaProgress({ itemId: q.itemId, memberId: state.memberId, position: Math.floor(state.position) }).catch(() => {});
}

async function loadTrack(index: number, offset: number, autoplay: boolean) {
  const q = state.queue;
  if (!q) return;
  const a = element();
  set({ index, loading: true, position: (q.tracks[index]?.start ?? 0) + offset });
  a.src = fileUrl(q.itemId, index);
  if (offset > 0) {
    // Seeking needs the file's length first.
    await new Promise<void>((resolve) => a.addEventListener("loadedmetadata", () => resolve(), { once: true }));
    a.currentTime = offset;
  }
  keep(true);
  if (autoplay) await a.play().catch((e: unknown) => set({ loading: false, playing: false, error: e instanceof DOMException && e.name === "NotAllowedError" ? "tapToPlay" : "remote" }));
  mediaSession();
}

function mediaSession() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !state.item) return;
  const s = navigator.mediaSession;
  s.metadata = new MediaMetadata({ title: state.queue?.tracks[state.index]?.title || state.item.name, album: state.item.name, artwork: [{ src: coverUrl(state.item.id), sizes: "480x480" }] });
  s.setActionHandler("play", () => void player.resume());
  s.setActionHandler("pause", () => player.pause());
  s.setActionHandler("previoustrack", () => void player.previous());
  s.setActionHandler("nexttrack", () => void player.next());
}

export const player = {
  /**
   * Starts a shelf item on this screen; an audiobook where this child
   * stopped, or at the start of the file `index` (a track picked from the
   * list). Returns the error code when it couldn't start ("pin": a locked
   * wall, when the household asked for the PIN, D64); what played before
   * then carries on. `at`: seconds into the item, for music this device
   * remembered (an audiobook goes on from its saved place).
   */
  async play(item: ShelfEntry, memberId?: string, index?: number, at?: number): Promise<string | undefined> {
    if (state.item?.id === item.id && state.memberId === memberId && state.queue) return void (await (index === undefined ? player.resume() : player.jump(index)));
    const mine = ++ticket;
    const r = await mediaQueue({ itemId: item.id, memberId }).catch(() => ({ ok: false as const, error: "network" }));
    if (mine !== ticket) return undefined;
    if (!r.ok && (r.error === "pin" || r.error === "forbidden")) return r.error;
    if (state.playing) await saveProgress();
    audio?.pause();
    set({ ...IDLE, item, memberId, loading: true });
    if (!r.ok) {
      set({ loading: false, error: r.error });
      return r.error;
    }
    const from = index !== undefined && index < r.data.tracks.length ? { index, offset: 0 }
      : trackAt(r.data.tracks, r.data.resumable || at === undefined ? r.data.position : at);
    set({ queue: r.data, duration: totalOf(r.data.tracks) });
    await loadTrack(from.index, from.offset, true);
    return undefined;
  },
  /**
   * Carries on. What came back after a reload starts again where it was:
   * a start, so it can need the PIN like any other (its error code then).
   */
  async resume(): Promise<string | undefined> {
    if (state.item && !state.queue) {
      const { item, memberId, position, duration } = state;
      return player.play(item, memberId, undefined, duration && position >= duration - 1 ? 0 : position);
    }
    if (!audio || !state.queue) return;
    // A finished item starts again.
    if (state.duration && state.position >= state.duration - 1) return void (await loadTrack(0, 0, true));
    await audio.play().catch(() => set({ error: "remote" }));
  },
  pause() {
    audio?.pause();
  },
  toggle() {
    return state.playing ? player.pause() : player.resume();
  },
  async next() {
    if (state.queue && state.index < state.queue.tracks.length - 1) await loadTrack(state.index + 1, 0, true);
  },
  /** Back to the start of the file, or to the one before when it has only just begun. */
  async previous() {
    if (!audio || !state.queue) return;
    if (audio.currentTime > 5 || state.index === 0) {
      audio.currentTime = 0;
      return;
    }
    await loadTrack(state.index - 1, 0, true);
  },
  /** Plays the file `index` from its start: a track picked from the list. */
  async jump(index: number) {
    if (state.queue && index >= 0 && index < state.queue.tracks.length) await loadTrack(index, 0, true);
  },
  async seek(position: number) {
    if (!state.queue) return;
    const { index, offset } = trackAt(state.queue.tracks, position);
    if (index === state.index && audio) {
      audio.currentTime = offset;
      set({ position });
    } else await loadTrack(index, offset, state.playing);
  },
  /** Stops and forgets the item (its place is saved first). */
  async stop() {
    audio?.pause();
    await saveProgress();
    if (audio) audio.removeAttribute("src");
    audio?.load();
    set(IDLE);
    keep(true);
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) navigator.mediaSession.metadata = null;
  },
};

const subscribe = (l: () => void) => {
  restore();
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;
/** The player's state outside render, for event handlers. */
export const playerState = () => state;
const serverSnapshot = () => IDLE;

/** The screen's player, for components. */
export function usePlayer(): PlayerState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
