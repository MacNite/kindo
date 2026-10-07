"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  ActionResult, Completion, HouseholdData, HouseholdWire, PhotoAlbum, Reward, RewardMode, TaskItem, WidgetConfig, WidgetId,
} from "../types";
import { dateKey } from "../dates";
import { hydrateEvent } from "../events";
import { completionOutcome, doneKey } from "../ledger";
import { guessCategory } from "../shopping";
import { useToday } from "../useToday";
import { calendarSelectors } from "../services/calendar";
import { householdSelectors } from "../services/household";
import * as A from "../services/actions";

/**
 * The device's copy of the household (§19.2). It starts from the snapshot the
 * server rendered with, applies the user's own changes optimistically, and
 * refetches whenever the server announces a change over `/api/stream`, so the
 * wall and every phone stay in step.
 *
 * Components call these actions and selectors; they never talk to the server
 * or mutate data themselves.
 */
export function hydrate(w: HouseholdWire): HouseholdData {
  return {
    ...w,
    meals: w.meals.map((m) => {
      const [y, mo, d] = m.day.split("-").map(Number);
      return { ...m, date: new Date(y, mo - 1, d) };
    }),
    events: w.events.map(hydrateEvent),
  };
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export type SyncStatus = "live" | "connecting" | "offline";

function useHousehold(initial: HouseholdWire) {
  const today = useToday();
  const [data, setData] = useState<HouseholdData>(() => hydrate(initial));
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>("connecting");
  const pending = useRef(0);
  const stale = useRef(false);
  const fetching = useRef(false);

  /** Refetches the snapshot. While the user's own changes are in flight it waits, so they don't flicker back. */
  const refresh = useCallback(async () => {
    if (pending.current > 0 || fetching.current) {
      stale.current = true;
      return;
    }
    fetching.current = true;
    stale.current = false;
    try {
      const w = await A.getSnapshot();
      if (!w) {
        window.location.assign("/setup");
        return;
      }
      if (pending.current === 0) setData(hydrate(w));
      else stale.current = true;
    } catch {
      setSync("offline");
    } finally {
      fetching.current = false;
      if (stale.current && pending.current === 0) void refresh();
    }
  }, []);

  /**
   * Applies `optimistic` at once, then runs the action. On failure the
   * server's truth comes back and the error is shown.
   */
  const mutate = useCallback(async <T,>(optimistic: ((d: HouseholdData) => HouseholdData) | null, call: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
    if (optimistic) setData(optimistic);
    pending.current++;
    let result: ActionResult<T>;
    try {
      result = await call();
    } catch {
      result = { ok: false, error: "network" };
    }
    pending.current--;
    if (!result.ok) {
      setError(result.error);
      stale.current = true;
    }
    if (pending.current === 0) void refresh();
    return result;
  }, [refresh]);

  // Live updates from the server; the browser reconnects EventSource on its own.
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/stream");
    es.onopen = () => {
      setSync("live");
      void refresh();
    };
    es.onerror = () => setSync(navigator.onLine ? "connecting" : "offline");
    es.addEventListener("change", () => void refresh());
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      es.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // ── Selectors ─────────────────────────────────────────────────────────────
  const selectors = useMemo(() => ({ ...householdSelectors(data), ...calendarSelectors(data.sources, data.events) }), [data]);
  const doneSet = useMemo(() => new Set(data.completions.map((c) => doneKey(c.itemId, c.day))), [data.completions]);
  const isDone = useCallback((itemId: string, date = today) => doneSet.has(doneKey(itemId, dateKey(date))), [doneSet, today]);

  // ── Routines, chores, approvals, rewards ──────────────────────────────────
  const setItemDone = useCallback((memberId: string | null, item: TaskItem, done: boolean, date = today) => {
    const day = dateKey(date);
    const key = doneKey(item.id, day);
    return mutate((d) => {
      const without = d.completions.filter((c) => doneKey(c.itemId, c.day) !== key);
      if (!done) return { ...d, completions: without, approvals: d.approvals.filter((a) => doneKey(a.item.id, a.day) !== key) };
      const outcome = completionOutcome(item.value, memberId !== null);
      const c: Completion = { id: `tmp-${key}`, itemId: item.id, memberId, day, status: outcome.status, pictogram: item.pictogram, label: item.label, at: new Date() };
      const approvals = outcome.status === "pending" && memberId ? [...d.approvals, { id: c.id, memberId, item, day, at: c.at }] : d.approvals;
      return { ...d, completions: [...without, c], approvals };
    }, () => A.setCompletion({ itemId: item.id, memberId, day, done }));
  }, [mutate, today]);

  const toggleTaskItem = useCallback((memberId: string | null, item: TaskItem, date = today) =>
    setItemDone(memberId, item, !isDone(item.id, date), date), [setItemDone, isDone, today]);

  const resolveApproval = (id: string, ok: boolean) => mutate((d) => {
    const req = d.approvals.find((a) => a.id === id);
    const completions = req && !ok ? d.completions.filter((c) => !(c.itemId === req.item.id && c.day === req.day)) : d.completions;
    return { ...d, approvals: d.approvals.filter((a) => a.id !== id), completions };
  }, () => A.resolveApproval({ id, ok }));

  const redeem = (memberId: string, reward: Reward) => mutate(
    (d) => ((d.balances[memberId] ?? 0) >= reward.cost ? { ...d, balances: { ...d.balances, [memberId]: d.balances[memberId] - reward.cost } } : d),
    () => A.redeem({ memberId, rewardId: reward.id }),
  );

  const setRewardMode = (mode: RewardMode) => mutate((d) => ({ ...d, household: { ...d.household, rewardMode: mode } }), () => A.setRewardMode({ mode }));

  // ── Shopping ──────────────────────────────────────────────────────────────
  const setShoppingDone = (id: string, done: boolean) =>
    mutate((d) => ({ ...d, shoppingItems: d.shoppingItems.map((i) => (i.id === id ? { ...i, done } : i)) }), () => A.setShoppingDone({ id, done }));
  const toggleShopping = (id: string) => setShoppingDone(id, !data.shoppingItems.find((i) => i.id === id)?.done);
  const addShopping = (listId: string, name: string, memberId?: string) => {
    const id = uid();
    return mutate(
      (d) => ({ ...d, shoppingItems: [{ id, listId, name, category: guessCategory(name, listId), memberId, done: false }, ...d.shoppingItems] }),
      () => A.addShoppingItem({ id, listId, name, memberId }),
    );
  };
  const clearDone = (listId: string) =>
    mutate((d) => ({ ...d, shoppingItems: d.shoppingItems.filter((i) => !(i.listId === listId && i.done)) }), () => A.clearDoneShopping({ listId }));

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const toggleTask = (id: string) => {
    const done = !data.tasks.find((t) => t.id === id)?.done;
    return mutate((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done } : t)) }), () => A.setTaskDone({ id, done }));
  };
  const addTask = (title: string, memberId: string | null, due?: Date) => {
    const id = uid();
    return mutate((d) => ({ ...d, tasks: [{ id, title, memberId, due, done: false }, ...d.tasks] }), () => A.addTask({ id, title, memberId, due }));
  };

  // ── Dashboard ─────────────────────────────────────────────────────────────
  const setWidgets = (next: (w: WidgetConfig[]) => WidgetConfig[]) => {
    const widgets = next(data.household.widgets);
    return mutate((d) => ({ ...d, household: { ...d.household, widgets } }), () => A.saveWidgets({ widgets }));
  };
  const moveWidget = (id: WidgetId, dir: -1 | 1) => setWidgets((w) => {
    const visible = w.filter((x) => x.enabled);
    const i = visible.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= visible.length) return w;
    const a = w.indexOf(visible[i]), b = w.indexOf(visible[j]);
    const next = [...w];
    [next[a], next[b]] = [next[b], next[a]];
    return next;
  });
  const updateWidget = (id: WidgetId, patch: Partial<WidgetConfig>) => setWidgets((w) => w.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // ── Photos ────────────────────────────────────────────────────────────────
  const updateAlbum = (id: string, patch: Partial<Pick<PhotoAlbum, "selected" | "weight">>) =>
    mutate((d) => ({ ...d, albums: d.albums.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), () => A.updateAlbum({ id, ...patch }));
  const setIdleMinutes = (idleMinutes: number) =>
    mutate((d) => ({ ...d, household: { ...d.household, idleMinutes } }), () => A.setPhotoPrefs({ idleMinutes }));
  const setShowPhotoMeta = (showPhotoMeta: boolean) =>
    mutate((d) => ({ ...d, household: { ...d.household, showPhotoMeta } }), () => A.setPhotoPrefs({ showPhotoMeta }));

  /** Runs any other action (editors, settings) and refreshes afterwards. */
  const run = <T,>(call: () => Promise<ActionResult<T>>) => mutate(null, call);

  return {
    data, ...selectors, sync, error, clearError: () => setError(null), refresh, run,
    isDone, setItemDone, toggleTaskItem,
    approvals: data.approvals, resolveApproval, balances: data.balances, redeem,
    rewardMode: data.household.rewardMode, pointValue: data.household.pointValue, setRewardMode,
    shopping: data.shoppingItems, shoppingLists: data.shoppingLists, toggleShopping, setShoppingDone, addShopping, clearDone,
    tasks: data.tasks, toggleTask, addTask,
    widgets: data.household.widgets, moveWidget, updateWidget,
    albums: data.albums, updateAlbum, idleMinutes: data.household.idleMinutes, setIdleMinutes,
    showPhotoMeta: data.household.showPhotoMeta, setShowPhotoMeta,
  };
}

export type Household = ReturnType<typeof useHousehold>;
const Ctx = createContext<Household | null>(null);

export function StoreProvider({ initial, children }: { initial: HouseholdWire; children: ReactNode }) {
  const value = useHousehold(initial);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore outside StoreProvider");
  return c;
}
