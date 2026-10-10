"use client";
import { useSyncExternalStore } from "react";
import { PROGRESS_EVERY_MS, totalOf, trackAt, type Queue, type ShelfEntry } from "../media";
import { mediaQueue, saveMediaProgress } from "../services/media";

/**
 * The screen's own player for the kids' shelf (§23). One per browser tab, kept
 * outside React so the music carries on from page to page (the wall, the
 * child's view, Settings) and a mini player anywhere can show it. Sound comes
 * through Kindo (`/api/media/<item>/<file>`); an audiobook's place is saved
 * every half minute and whenever it stops.
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

function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
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
  /** Starts a shelf item on this screen; an audiobook where this child stopped. */
  async play(item: ShelfEntry, memberId?: string) {
    if (state.item?.id === item.id && state.memberId === memberId && state.queue) return player.resume();
    if (state.playing) await saveProgress();
    audio?.pause();
    set({ ...IDLE, item, memberId, loading: true });
    const r = await mediaQueue({ itemId: item.id, memberId }).catch(() => ({ ok: false as const, error: "network" }));
    if (state.item?.id !== item.id) return;
    if (!r.ok) return set({ loading: false, error: r.error });
    const { index, offset } = trackAt(r.data.tracks, r.data.position);
    set({ queue: r.data, duration: totalOf(r.data.tracks) });
    await loadTrack(index, offset, true);
  },
  async resume() {
    if (!audio || !state.queue) return;
    // A finished item starts again.
    if (state.duration && state.position >= state.duration - 1) return loadTrack(0, 0, true);
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
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) navigator.mediaSession.metadata = null;
  },
};

const subscribe = (l: () => void) => {
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
