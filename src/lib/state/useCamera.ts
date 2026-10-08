"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TALK_RENEW_MS } from "../cameras";
import { CameraError, openCamera, openMicrophone, screenId } from "../cameraRtc";
import { releaseTalk, takeTalk } from "../services/cameras";
import { useStore } from "./store";

export type StreamState = "connecting" | "live" | "error";

/** A view that hasn't shown a picture after this long has failed (go2rtc unreachable on 8555, a codec the browser can't play). */
const START_TIMEOUT_MS = 15_000;

/**
 * Live view of one camera while `active` and the page is visible (§22). With
 * `mic`, it opens the camera's two-way stream instead. Everything is closed
 * on unmount, when the page is hidden, and when the inputs change.
 */
export function useCameraStream(cameraId: string, { active = true, mic, screen }: { active?: boolean; mic?: MediaStreamTrack | null; screen?: string } = {}) {
  const [media, setMedia] = useState<MediaStream | null>(null);
  const [state, setState] = useState<StreamState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  useEffect(() => {
    if (!active || !visible) return;
    const abort = new AbortController();
    let pc: RTCPeerConnection | undefined;
    setState("connecting");
    setError(null);
    const fail = (code: string) => {
      if (abort.signal.aborted) return;
      setState("error");
      setError(code);
      pc?.close();
    };
    const timer = setTimeout(() => fail("remote"), START_TIMEOUT_MS);
    openCamera(cameraId, { mic: mic ?? undefined, screen, signal: abort.signal }).then((link) => {
      if (abort.signal.aborted) return link.pc.close();
      pc = link.pc;
      setMedia(link.media);
      const watch = () => {
        const s = link.pc.connectionState;
        if (s === "connected") {
          clearTimeout(timer);
          setState("live");
        } else if (s === "failed" || s === "closed") fail("remote");
      };
      link.pc.addEventListener("connectionstatechange", watch);
      watch();
    }, (e) => fail(e instanceof CameraError ? e.code : "remote"));
    return () => {
      clearTimeout(timer);
      abort.abort();
      pc?.close();
      setMedia(null);
    };
  }, [cameraId, active, visible, mic, screen, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { media, state, error, retry };
}

export type TalkState = "off" | "starting" | "on";

/**
 * Talking through a camera (§22): asks for the microphone only when someone
 * taps Talk, takes the camera's one-speaker lease and keeps renewing it, and
 * sends sound only while `speak(true)`. A wall display without the PIN is
 * asked for it first. `stop` (and unmounting, and hiding the page) ends it:
 * the microphone is released and the lease given back.
 */
export function useTalk(cameraId: string) {
  const { viewer, requestPin } = useStore();
  const [mic, setMic] = useState<MediaStreamTrack | null>(null);
  const [state, setState] = useState<TalkState>("off");
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const screen = useRef("");
  const micRef = useRef<MediaStreamTrack | null>(null);
  const renew = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  /** Bumped by every stop: a start still waiting for the microphone or the lease gives up when it changes. */
  const generation = useRef(0);
  if (!screen.current && typeof window !== "undefined") screen.current = screenId();

  const stop = useCallback(() => {
    generation.current++;
    clearInterval(renew.current);
    renew.current = undefined;
    const had = micRef.current;
    micRef.current?.stop();
    micRef.current = null;
    setMic(null);
    setSpeaking(false);
    setState("off");
    if (had) void releaseTalk({ cameraId, screen: screen.current }).catch(() => {});
  }, [cameraId]);

  const start = useCallback(async () => {
    setError(null);
    if (!viewer.canManage) {
      requestPin();
      return;
    }
    setState("starting");
    const mine = generation.current;
    let track: MediaStreamTrack;
    try {
      track = await openMicrophone();
    } catch (e) {
      if (generation.current !== mine) return;
      setState("off");
      setError(e instanceof CameraError ? e.code : "micDenied");
      return;
    }
    track.enabled = false;
    // Closed while the browser asked for the microphone: let go of it at once.
    if (generation.current !== mine) return track.stop();
    const r = await takeTalk({ cameraId, screen: screen.current }).catch(() => ({ ok: false as const, error: "network" }));
    if (generation.current !== mine) {
      track.stop();
      if (r.ok) void releaseTalk({ cameraId, screen: screen.current }).catch(() => {});
      return;
    }
    if (!r.ok) {
      track.stop();
      setState("off");
      if (r.error === "pin") requestPin();
      else setError(r.error);
      return;
    }
    micRef.current = track;
    setMic(track);
    setState("on");
    renew.current = setInterval(async () => {
      const again = await takeTalk({ cameraId, screen: screen.current }).catch(() => ({ ok: false as const, error: "network" }));
      // Lost the camera (expired while offline, or the PIN ran out): stop rather than talk into nothing.
      if (!again.ok && again.error !== "network") {
        stop();
        setError(again.error);
      }
    }, TALK_RENEW_MS);
  }, [cameraId, viewer.canManage, requestPin, stop]);

  const speak = useCallback((on: boolean) => {
    if (!micRef.current) return;
    micRef.current.enabled = on;
    setSpeaking(on);
  }, []);

  // Never keep a microphone open in the background or after the view is gone.
  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && stop();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [stop]);

  return { mic, screen: screen.current, state, speaking, error, start, stop, speak };
}
