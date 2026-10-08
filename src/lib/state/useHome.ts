"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HomeState } from "../home";
import { allOff as allOffAction, readHome, setSwitch } from "../services/home";
import { useStore } from "./store";

/** How often an open Home control view reads the switches and the solar flow. */
export const HOME_POLL_MS = 15_000;

/**
 * Home control (§21) for one screen: reads the switches and the solar flow
 * while it is visible, again whenever Home Assistant reports a switch change,
 * and switches with an optimistic update.
 */
export function useHome() {
  const { home, homeTick, run } = useStore();
  const [state, setState] = useState<HomeState | null>(null);
  const [loading, setLoading] = useState(Boolean(home));
  const busy = useRef(0);
  const configured = Boolean(home);

  const load = useCallback(async () => {
    if (!configured) return;
    try {
      const r = await readHome({});
      // A switch in flight keeps its optimistic state until Home Assistant has answered.
      if (r.ok && busy.current === 0) setState(r.data);
    } catch {
      // Offline: keep the last reading.
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), HOME_POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [configured, load, homeTick]);

  const change = useCallback(async (patch: (s: HomeState) => HomeState, call: () => ReturnType<typeof setSwitch>) => {
    setState((s) => (s ? patch(s) : s));
    busy.current++;
    await run(call);
    busy.current--;
    await load();
  }, [run, load]);

  const toggle = useCallback((entityId: string, on: boolean) => change(
    (s) => ({ ...s, switches: s.switches.map((x) => (x.entityId === entityId ? { ...x, on } : x)) }),
    () => setSwitch({ entityId, on }),
  ), [change]);

  const allOff = useCallback(() => change(
    (s) => ({ ...s, switches: s.switches.map((x) => ({ ...x, on: false })) }),
    () => allOffAction({}),
  ), [change]);

  return { setup: home, state, loading, toggle, allOff };
}
