"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type {
  ApprovalRequest, OneOffTask, PhotoAlbum, Reward, RewardMode, ShoppingItem, TaskItem, WidgetConfig, WidgetId,
} from "../types";
import { dateKey } from "../dates";
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
const today = dateKey(TODAY);
const seedDone = (routineId: string, count: number) =>
  ROUTINES.find((r) => r.id === routineId)!.items.slice(0, count).map((i) => `${i.id}@${today}`);

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
  const [done, setDone] = useState<Set<string>>(() => new Set([...seedDone("lena-morning", 3), ...seedDone("paul-morning", 2)]));
  const [shopping, setShopping] = useState<ShoppingItem[]>(ITEMS);
  const [tasks, setTasks] = useState<OneOffTask[]>(TASKS);
  const [balances, setBalances] = useState<Record<string, number>>(BALANCES);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(APPROVALS);
  const [rewardMode, setRewardMode] = useState<RewardMode>("stars");
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [albums, setAlbums] = useState<PhotoAlbum[]>(ALBUMS);
  const [idleMinutes, setIdleMinutes] = useState(2);

  const isDone = useCallback((itemId: string, date = TODAY) => done.has(`${itemId}@${dateKey(date)}`), [done]);

  const toggleTaskItem = useCallback((memberId: string, item: TaskItem, date = TODAY) => {
    const key = `${item.id}@${dateKey(date)}`;
    setDone((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    if (item.value.kind === "extra") {
      const extra = item.value;
      if (extra.needsApproval) {
        setApprovals((a) => a.some((r) => r.item.id === item.id) ? a.filter((r) => r.item.id !== item.id)
          : [...a, { id: `a-${key}`, memberId, item, at: new Date() }]);
      } else {
        setBalances((b) => ({ ...b, [memberId]: (b[memberId] ?? 0) + (done.has(key) ? -extra.points : extra.points) }));
      }
    }
  }, [done]);

  const resolveApproval = (id: string, ok: boolean) => {
    const req = approvals.find((a) => a.id === id);
    if (!req) return;
    if (ok && req.item.value.kind === "extra") {
      const pts = req.item.value.points;
      setBalances((b) => ({ ...b, [req.memberId]: (b[req.memberId] ?? 0) + pts }));
    }
    if (!ok) setDone((s) => { const n = new Set(s); n.delete(`${req.item.id}@${today}`); return n; });
    setApprovals((a) => a.filter((r) => r.id !== id));
  };

  const redeem = (memberId: string, reward: Reward) =>
    setBalances((b) => ((b[memberId] ?? 0) >= reward.cost ? { ...b, [memberId]: b[memberId] - reward.cost } : b));

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
