"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_VOICE_SECONDS, toPcm16, type AssistReply } from "../media";
import { player, usePlayer } from "./player";

export type VoiceState =
  | { phase: "idle" }
  | { phase: "listening" }
  | { phase: "thinking" }
  | { phase: "done"; reply: AssistReply }
  | { phase: "error"; code: string };

/**
 * Push-to-talk to Home Assistant (§24, §20 D62). The microphone opens when
 * the button is pressed and closes when it is let go (or after
 * `MAX_VOICE_SECONDS`); nothing is recorded otherwise. The recording goes to
 * Kindo as 16 kHz PCM, the answer comes back as words and, when Home
 * Assistant speaks, sound. Music on this screen pauses meanwhile.
 */
export function useVoice() {
  const [state, setState] = useState<VoiceState>({ phase: "idle" });
  const rec = useRef<{ stream: MediaStream; ctx: AudioContext; chunks: Float32Array[]; timer: ReturnType<typeof setTimeout>; cancelled?: boolean } | null>(null);
  const resumeMusic = useRef(false);
  /** The button was let go before the microphone was open. */
  const letGo = useRef(false);
  const { playing } = usePlayer();
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const release = () => {
    const r = rec.current;
    rec.current = null;
    if (!r) return null;
    clearTimeout(r.timer);
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close().catch(() => {});
    return r;
  };

  const stop = useCallback(async () => {
    if (!rec.current) {
      letGo.current = true;
      return;
    }
    const r = release();
    if (!r || r.cancelled) return;
    const length = r.chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(length);
    let at = 0;
    for (const c of r.chunks) {
      all.set(c, at);
      at += c.length;
    }
    const pcm = toPcm16(all, r.ctx.sampleRate);
    // A tap, not a command.
    if (pcm.length < 3200) return setState({ phase: "error", code: "voiceTooShort" });
    setState({ phase: "thinking" });
    try {
      const res = await fetch("/api/assist", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: pcm.buffer as ArrayBuffer });
      const body = (await res.json().catch(() => ({}))) as AssistReply & { error?: string };
      if (!res.ok) return setState({ phase: "error", code: body.error ?? "server" });
      setState({ phase: "done", reply: body });
      if (body.audio) {
        const a = new Audio(`data:${body.audio.type};base64,${body.audio.data}`);
        a.addEventListener("ended", () => resumeMusic.current && void player.resume(), { once: true });
        await a.play().catch(() => {});
      } else if (resumeMusic.current) void player.resume();
    } catch {
      setState({ phase: "error", code: "network" });
    }
  }, []);

  const start = useCallback(async () => {
    if (rec.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return setState({ phase: "error", code: "insecure" });
    letGo.current = false;
    resumeMusic.current = playingRef.current;
    if (playingRef.current) player.pause();
    setState({ phase: "listening" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      // ScriptProcessor is old but works everywhere without a separate worklet file; a few seconds of speech is all it carries.
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(node);
      node.connect(ctx.destination);
      const timer = setTimeout(() => void stop(), MAX_VOICE_SECONDS * 1000);
      rec.current = { stream, ctx, chunks, timer };
      if (letGo.current) void stop();
    } catch (e) {
      setState({ phase: "error", code: e instanceof DOMException && e.name === "NotAllowedError" ? "micDenied" : "server" });
    }
  }, [stop]);

  /** Closes the answer, or a recording without sending it. */
  const reset = useCallback(() => {
    const r = release();
    if (r) r.cancelled = true;
    setState({ phase: "idle" });
  }, []);

  // Leaving the view closes the microphone.
  useEffect(() => () => void release(), []);

  return { state, start, stop, reset };
}
