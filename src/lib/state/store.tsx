"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  ActionResult, Completion, HouseholdData, HouseholdWire, PhotoAlbum, Reward, RewardMode, TaskItem, WallTile, WallTileId, WidgetConfig, WidgetId,
} from "../types";
import { moved } from "../dashboard";
import { dateKey } from "../dates";
import { hydrateEvent } from "../events";
import { completionOutcome, doneKey, resolveRoutineValues } from "../ledger";
import { currentPeriod } from "../recurrence";
import { guessCategory } from "../shopping";
import { useToday } from "../useToday";
import { calendarSelectors } from "../services/calendar";
import { householdSelectors } from "../services/household";
import * as A from "../services/actions";
import { applyQueued, dequeue, enqueue, loadSnapshot, readQueue, saveSnapshot, type OfflineOp } from "./offline";

/** What may be done without a connection, and how to send it later (§19.7). */
const OFFLINE_ACTIONS: { [K in OfflineOp["name"]]: (input: Extract<OfflineOp, { name: K }>["input"]) => Promise<ActionResult<unknown>> } = {
  addShoppingItem: A.addShoppingItem,
  setShoppingDone: A.setShoppingDone,
  clearDoneShopping: A.clearDoneShopping,
};
const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * The device's copy of the household (§19.2). It starts from the snapshot the
 * server rendered with, applies the user's own changes optimistically, and
 * refetches whenever the server announces a change over `/api/stream`, so the
 * wall and every phone stay in step.
 *
 * Components call these actions and selectors; they never talk to the server
 * or mutate data themselves.
 */
export function hydrate({ generatedAt: _generatedAt, ...w }: HouseholdWire): HouseholdData {
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
  const [data, setData] = useState<HouseholdData>(() => hydrate(initial));
  const { dayStartsAt, morningUntil, afternoonUntil } = data.household;
  /** The household day routines and chores belong to: rolls over at the reset time, not midnight (§19.3). */
  const today = useToday(dayStartsAt);
  const times = useMemo(() => ({ dayStartsAt, morningUntil, afternoonUntil }), [dayStartsAt, morningUntil, afternoonUntil]);
  /** Which routine is "now". */
  const periodAt = useCallback((now: Date = new Date()) => currentPeriod(now, times), [times]);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>("connecting");
  /** A wall display tried something that needs the settings PIN: what to retry once it's unlocked. */
  /** The latest presence report from Home Assistant, if one is connected. */
  const [presence, setPresence] = useState<{ present: boolean; at: number } | null>(null);
  /** Counts "a switch changed" news from Home Assistant, so Home control reads the switches again (§21). */
  const [homeTick, setHomeTick] = useState(0);
  /** Counts doorbell news and reconnects, so the ring overlay asks whether someone is at the door (§22). */
  const [ringTick, setRingTick] = useState(0);
  const [pinRequest, setPinRequest] = useState<{ retry: () => Promise<unknown> } | null>(null);
  const pending = useRef(0);
  const stale = useRef(false);
  const fetching = useRef(false);
  /** Shopping changes made without a connection, waiting to be sent (mirrors IndexedDB). */
  const queue = useRef<OfflineOp[]>([]);
  const [queued, setQueued] = useState(0);
  const flushing = useRef(false);

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
        window.location.assign("/login");
        return;
      }
      if (pending.current === 0) setData(applyQueued(hydrate(w), queue.current));
      else stale.current = true;
      void saveSnapshot(w);
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
  const keepForLater = useCallback(async (op: OfflineOp) => {
    queue.current = [...queue.current, op];
    setQueued(queue.current.length);
    await enqueue(op);
  }, []);

  const mutate = useCallback(async <T,>(optimistic: ((d: HouseholdData) => HouseholdData) | null, call: () => Promise<ActionResult<T>>, offline?: OfflineOp): Promise<ActionResult<T>> => {
    if (optimistic) setData(optimistic);
    // No connection: shopping changes wait on the device; everything else says so.
    if (offline && isOffline()) {
      await keepForLater(offline);
      return { ok: true, data: undefined as T };
    }
    pending.current++;
    let result: ActionResult<T>;
    try {
      result = await call();
    } catch (e) {
      // The call never got an answer: offline, the server restarted, or this page is older than the server (reload).
      console.error("server action failed", e);
      result = { ok: false, error: "network" };
    }
    pending.current--;
    if (!result.ok && result.error === "network" && offline) {
      await keepForLater(offline);
      return { ok: true, data: undefined as T };
    }
    if (!result.ok) {
      stale.current = true;
      if (result.error === "unauthenticated") window.location.assign("/login");
      // A wall display needs the PIN: ask for it, then try again (§19.4).
      else if (result.error === "pin") setPinRequest({ retry: call });
      else setError(result.error);
    }
    if (pending.current === 0) void refresh();
    return result;
  }, [refresh, keepForLater]);

  /** Sends what was queued offline, oldest first; stops at the first sign the connection is gone again. */
  const flush = useCallback(async () => {
    if (flushing.current || isOffline()) return;
    flushing.current = true;
    try {
      for (const { key, op } of await readQueue()) {
        let r: ActionResult<unknown>;
        try {
          r = await (OFFLINE_ACTIONS[op.name] as (i: unknown) => Promise<ActionResult<unknown>>)(op.input);
        } catch {
          break;
        }
        if (!r.ok && r.error === "network") break;
        if (!r.ok) setError(r.error);
        await dequeue(key);
        queue.current = queue.current.slice(1);
        setQueued(queue.current.length);
      }
    } finally {
      flushing.current = false;
      void refresh();
    }
  }, [refresh]);

  // Picks up what an earlier visit queued, and, without a connection, the newest snapshot this device has.
  useEffect(() => {
    let live = true;
    (async () => {
      const ops = (await readQueue()).map((q) => q.op);
      if (!live) return;
      queue.current = ops;
      setQueued(ops.length);
      const cached = isOffline() ? await loadSnapshot() : undefined;
      if (!live) return;
      if (cached && new Date(cached.generatedAt) > new Date(initial.generatedAt)) setData(applyQueued(hydrate(cached), ops));
      else if (ops.length) setData((d) => applyQueued(d, ops));
      if (!isOffline()) void flush();
    })();
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => {
      live = false;
      window.removeEventListener("online", online);
    };
    // The initial snapshot only matters on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush]);

  // Live updates from the server; the browser reconnects EventSource on its own.
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/stream");
    es.onopen = () => {
      setSync("live");
      void refresh();
      // A ring may have come while this screen was away.
      setRingTick((n) => n + 1);
    };
    es.onerror = () => setSync(navigator.onLine ? "connecting" : "offline");
    es.addEventListener("change", (ev) => {
      let change: { topic?: string; present?: boolean } = {};
      try {
        change = JSON.parse((ev as MessageEvent).data);
      } catch {}
      // Presence (Home Assistant) is news for the wall, not a data change (§19.8).
      if (change.topic === "presence") setPresence({ present: Boolean(change.present), at: Date.now() });
      else if (change.topic === "home") setHomeTick((n) => n + 1);
      else if (change.topic === "doorbell") setRingTick((n) => n + 1);
      else void refresh();
    });
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

  const setRewardMode = (mode: RewardMode) =>
    mutate((d) => resolveRoutineValues({ ...d, household: { ...d.household, rewardMode: mode } }), () => A.setRewardMode({ mode }));
  /** Points for a child's routine steps, while they get used to them (§9, D42). */
  const setRoutineRewards = (memberId: string, on: boolean, points: number) => mutate(
    (d) => resolveRoutineValues({ ...d, members: d.members.map((m) => (m.id === memberId ? { ...m, routineRewards: { on, points } } : m)) }),
    () => A.setRoutineRewards({ memberId, on, points }),
  );

  // ── Shopping ──────────────────────────────────────────────────────────────
  const setShoppingDone = (id: string, done: boolean) =>
    mutate((d) => ({ ...d, shoppingItems: d.shoppingItems.map((i) => (i.id === id ? { ...i, done } : i)) }), () => A.setShoppingDone({ id, done }),
      { name: "setShoppingDone", input: { id, done } });
  const toggleShopping = (id: string) => setShoppingDone(id, !data.shoppingItems.find((i) => i.id === id)?.done);
  const addShopping = (listId: string, name: string, memberId?: string) => {
    const id = uid();
    return mutate(
      (d) => ({ ...d, shoppingItems: [{ id, listId, name, category: guessCategory(name, listId), memberId, done: false }, ...d.shoppingItems] }),
      () => A.addShoppingItem({ id, listId, name, memberId }),
      { name: "addShoppingItem", input: { id, listId, name, memberId } },
    );
  };
  const clearDone = (listId: string) =>
    mutate((d) => ({ ...d, shoppingItems: d.shoppingItems.filter((i) => !(i.listId === listId && i.done)) }), () => A.clearDoneShopping({ listId }),
      { name: "clearDoneShopping", input: { listId } });

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const toggleTask = (id: string) => {
    const done = !data.tasks.find((t) => t.id === id)?.done;
    return mutate((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done } : t)) }), () => A.setTaskDone({ id, done }));
  };
  const addTask = (title: string, memberId: string | null, due?: Date) => {
    const id = uid();
    return mutate((d) => ({ ...d, tasks: [{ id, title, memberId, due, done: false }, ...d.tasks] }), () => A.addTask({ id, title, memberId, due }));
  };
  const deleteTask = (id: string) =>
    mutate((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }), () => A.deleteTask({ id }));

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

  /** The wall display's household tiles (§4, §21). */
  const setWallTiles = (next: (t: WallTile[]) => WallTile[]) => {
    const tiles = next(data.household.wallTiles);
    return mutate((d) => ({ ...d, household: { ...d.household, wallTiles: tiles } }), () => A.saveWallTiles({ tiles }));
  };
  const moveWallTile = (id: WallTileId, dir: -1 | 1) => setWallTiles((t) => moved(t, t.findIndex((x) => x.id === id), dir));
  const showWallTile = (id: WallTileId, enabled: boolean) => setWallTiles((t) => t.map((x) => (x.id === id ? { ...x, enabled } : x)));

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
    routineDay: today, times, periodAt, viewer: data.viewer, queued, presence,
    pinRequest, requestPin: () => setPinRequest({ retry: async () => {} }), closePin: () => setPinRequest(null),
    isDone, setItemDone, toggleTaskItem,
    approvals: data.approvals, resolveApproval, balances: data.balances, redeem,
    rewardMode: data.household.rewardMode, pointValue: data.household.pointValue, setRewardMode, setRoutineRewards,
    shopping: data.shoppingItems, shoppingLists: data.shoppingLists, toggleShopping, setShoppingDone, addShopping, clearDone,
    tasks: data.tasks, toggleTask, addTask, deleteTask,
    widgets: data.household.widgets, moveWidget, updateWidget,
    wallTiles: data.household.wallTiles, moveWallTile, showWallTile, home: data.home, homeTick,
    cameras: data.cameras, ringTick,
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
