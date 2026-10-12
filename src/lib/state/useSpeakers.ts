"use client";
import { useCallback, useEffect, useState } from "react";
import type { SpeakerState } from "../media";
import { playOnSpeaker, readSpeakers, speakerCommand } from "../services/media";
import { useStore } from "./store";
import { speakerWatch } from "./speakerWatch";

/** How often an open player reads the speakers. */
const SPEAKER_POLL_MS = 5_000;

/**
 * The admin's speakers (§23) for one view: read while it is visible, and
 * played, paused, stopped and turned up or down through Kindo. Home
 * Assistant clamps nothing, so the server does: never louder than allowed.
 */
export function useSpeakers(active = true) {
  const { data, run } = useStore();
  const configured = (data.media?.speakers.length ?? 0) > 0;
  const [speakers, setSpeakers] = useState<SpeakerState[] | null>(null);

  const load = useCallback(async () => {
    if (!configured) return;
    const r = await readSpeakers({}).catch(() => null);
    if (r?.ok) setSpeakers(r.data);
  }, [configured]);

  useEffect(() => {
    if (!configured || !active) return;
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), SPEAKER_POLL_MS);
    return () => clearInterval(timer);
  }, [configured, active, load]);

  const after = useCallback(async <T,>(call: () => ReturnType<typeof speakerCommand> | Promise<T>) => {
    await run(call as never);
    setTimeout(() => void load(), 800);
    speakerWatch.refresh();
  }, [run, load]);

  return {
    speakers: speakers ?? (data.media?.speakers ?? []).map((s): SpeakerState => ({ ...s, state: "unavailable", maxVolume: 100 })),
    loaded: speakers !== null,
    play: (speaker: string, itemId: string, memberId?: string, index?: number) => after(() => playOnSpeaker({ speaker, itemId, memberId, index })),
    command: (speaker: string, command: "play" | "pause" | "stop" | "next" | "previous") => after(() => speakerCommand({ speaker, command })),
    /** A track from the list, of the item the speaker plays. */
    track: (speaker: string, index: number) => after(() => speakerCommand({ speaker, command: "track", index })),
    volume: (speaker: string, volume: number) => after(() => speakerCommand({ speaker, command: "volume", volume })),
  };
}
