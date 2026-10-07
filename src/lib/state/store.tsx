"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type {
  OneOffTask, PhotoAlbum, Reward, RewardMode, ShoppingItem, TaskItem, WidgetConfig, WidgetId,
} from "../types";
import { dateKey } from "../dates";
import { doneKey, resolveApproval as resolveRequest, toggleItem, type Ledger } from "../ledger";
import { useToday } from "../useToday";
import { TODAY } from "../data/anchor";
import { ROUTINES, TASKS } from "../data/routines";
import { APPROVALS, BALANCES } from "../data/rewards";
import { ITEMS } from "../data/shopping";
import { ALBUMS } from "../data/photos";

/**
 * In-memory household state for the prototype.
 * Everything here maps 1:1 onto a future API (see README "Next steps");
 * components call these actions and never mutate data themselves.
 */
const seedDay = dateKey(TODAY);
const seedDone = (routineId: string, count: number) =>
  ROUTINES.find((r) => r.id === routineId)!.items.slice(0, count).map((i) => doneKey(i.id, seedDay));
const SEED_LEDGER: Ledger = {
  // Pending approval requests mean the child already ticked the item.
  done: new Set([...seedDone("lena-morning", 3), ...seedDone("paul-morning", 2), ...APPROVALS.map((a) => doneKey(a.item.id, a.day))]),
  approvals: APPROVALS,
  balances: BALANCES,
  awarded: {},
};

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "agenda", enabled: true, size: "m" },
  { id: "weather", enabled: true, size: "s" },
  { id: "meals", enabled: true, size: "s" },
  { id: "chores", enabled: true, size: "m" },
  { id: "dates", enabled: true, size: "m" },
  { id: "shopping", enabled: true, size: "s" },
  { id: "photos", enabled: true, size: "s" },
  { id: "upcoming", enabled: true, size: "m" },
  { id: "clock", enabled: false, size: "s" },
  { id: "routines", enabled: false, size: "m" },
];

function useHousehold() {
  const today = useToday();
  const [ledger, setLedger] = useState<Ledger>(SEED_LEDGER);
  const { done, approvals, balances } = ledger;
  const [shopping, setShopping] = useState<ShoppingItem[]>(ITEMS);
  const [tasks, setTasks] = useState<OneOffTask[]>(TASKS);
  const [rewardMode, setRewardMode] = useState<RewardMode>("stars");
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [albums, setAlbums] = useState<PhotoAlbum[]>(ALBUMS);
  const [idleMinutes, setIdleMinutes] = useState(2);

  const isDone = useCallback((itemId: string, date = today) => done.has(doneKey(itemId, dateKey(date))), [done, today]);

  const toggleTaskItem = useCallback((memberId: string, item: TaskItem, date = today) =>
    setLedger((l) => toggleItem(l, memberId, item, date)), [today]);

  const resolveApproval = (id: string, ok: boolean) => setLedger((l) => resolveRequest(l, id, ok));

  const redeem = (memberId: string, reward: Reward) =>
    setLedger((l) => ((l.balances[memberId] ?? 0) >= reward.cost ? { ...l, balances: { ...l.balances, [memberId]: l.balances[memberId] - reward.cost } } : l));

  // Shopping
  const toggleShopping = (id: string) => setShopping((l) => l.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const addShopping = (listId: string, name: string, memberId?: string) =>
    setShopping((l) => [{ id: `s-${Date.now()}`, listId, name, category: guessCategory(name, listId), memberId, done: false }, ...l]);
  const clearDone = (listId: string) => setShopping((l) => l.filter((i) => !(i.listId === listId && i.done)));

  // Tasks
  const toggleTask = (id: string) => setTasks((l) => l.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const addTask = (title: string, memberId: string | null) => setTasks((l) => [{ id: `o-${Date.now()}`, title, memberId, done: false }, ...l]);

  // Dashboard
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

  // Photos
  const updateAlbum = (id: string, patch: Partial<PhotoAlbum>) => setAlbums((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return {
    isDone, toggleTaskItem, approvals, resolveApproval, balances, redeem, rewardMode, setRewardMode,
    shopping, toggleShopping, addShopping, clearDone, tasks, toggleTask, addTask,
    widgets, moveWidget, updateWidget, albums, updateAlbum, idleMinutes, setIdleMinutes,
  };
}

/** Naive keyword categoriser so quick-add lands somewhere sensible. */
function guessCategory(name: string, listId: string): ShoppingItem["category"] {
  if (listId === "hardware") return "hardware";
  if (listId === "drugstore") return "care";
  const n = name.toLowerCase();
  if (/milch|milk|käse|cheese|joghurt|yog|butter|sahne|cream/.test(n)) return "dairy";
  if (/apfel|äpfel|apple|banan|tomat|salat|lettuce|karotte|carrot|gurke|zwiebel|onion|obst|fruit/.test(n)) return "produce";
  if (/brot|bread|brötchen|roll|brez/.test(n)) return "bakery";
  if (/tk|frozen|eis\b|ice cream/.test(n)) return "frozen";
  return "other";
}

type Household = ReturnType<typeof useHousehold>;
const Ctx = createContext<Household | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useHousehold();
  return <Ctx.Provider value={useMemo(() => value, [value])}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore outside StoreProvider");
  return c;
}
