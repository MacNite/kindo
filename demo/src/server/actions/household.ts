import { z } from "zod";
import type * as Real from "@/server/actions/household";
import type { Photo, Recurrence, TaskValue, Text } from "@/lib/types";
import { addDays, dateKey, startOfDay } from "@/lib/dates";
import { allDayForStorage, eventAccess } from "@/lib/events";
import { completionOutcome, routineStepValue } from "@/lib/ledger";
import { normalizeRecurrence, sameRecurrence } from "@/lib/recurrence";
import { guessCategory } from "@/lib/shopping";
import { isBlankText } from "@/lib/text";
import { weightedPlaylist } from "@/lib/services/photos";
import { S } from "@/server/validation";
import { DemoError, act, load, newId, snapshot, type DemoState } from "../demo/browser";

/**
 * The static demo's household actions (§20 D74): the rules of
 * `src/server/household.ts`, applied to the household in this browser. Same
 * names, inputs and results as the Server Actions they replace in the
 * GitHub Pages build, so every screen works unchanged.
 */
const notFound = () => new DemoError("notFound");

export const getSnapshot: typeof Real.getSnapshot = async () => snapshot();

// ── Ticking off ─────────────────────────────────────────────────────────────
function findItem(s: DemoState, itemId: string) {
  for (const r of s.routines) {
    const step = r.items.find((i) => i.id === itemId);
    if (step) {
      const member = s.members.find((m) => m.id === r.memberId);
      return { pictogram: step.pictogram, label: step.label, value: routineStepValue(step.own ?? { kind: "expected" }, member?.routineRewards, s.household.rewardMode), ownerId: r.memberId };
    }
  }
  const chore = s.chores.find((c) => c.id === itemId);
  return chore ? { pictogram: chore.item.pictogram, label: chore.item.label, value: chore.item.value, ownerId: chore.memberId } : null;
}

const earn = (s: DemoState, memberId: string, points: number) => (s.balances[memberId] = (s.balances[memberId] ?? 0) + points);

export const setCompletion: typeof Real.setCompletion = act(S.completion, (s, input) => {
  const today = startOfDay(new Date());
  if (input.day < dateKey(addDays(today, -7)) || input.day > dateKey(addDays(today, 1))) throw new DemoError("invalid");
  const existing = s.completions.find((c) => c.itemId === input.itemId && c.day === input.day);
  if (!input.done) {
    if (existing) {
      // Unticking takes back what it earned.
      const v = existing.value;
      if (existing.status === "done" && existing.memberId && v.kind === "extra") earn(s, existing.memberId, -v.points);
      s.completions = s.completions.filter((c) => c !== existing);
    }
    return;
  }
  if (existing) return;
  const item = findItem(s, input.itemId);
  if (!item) throw notFound();
  const memberId = item.ownerId ?? input.memberId ?? null;
  const outcome = completionOutcome(item.value, memberId !== null, s.household.rewardMode);
  s.completions.push({
    id: newId(s, "c"), itemId: input.itemId, memberId, day: input.day, status: outcome.status,
    pictogram: item.pictogram, label: item.label, value: outcome.points ? item.value : { kind: "expected" }, at: new Date(),
  });
  if (outcome.points && memberId) earn(s, memberId, outcome.points);
});

export const resolveApproval: typeof Real.resolveApproval = act(S.resolveApproval, (s, input) => {
  const c = s.completions.find((x) => x.id === input.id);
  if (!c || c.status !== "pending") return;
  if (!input.ok) {
    s.completions = s.completions.filter((x) => x !== c);
    return;
  }
  c.status = "done";
  if (c.value.kind === "extra" && c.value.points > 0 && c.memberId) earn(s, c.memberId, c.value.points);
});

// ── Rewards ─────────────────────────────────────────────────────────────────
export const redeem: typeof Real.redeem = act(S.redeem, (s, input) => {
  if (!s.members.some((m) => m.id === input.memberId)) throw notFound();
  const reward = s.rewards.find((r) => r.id === input.rewardId);
  if (!reward) throw notFound();
  if ((s.balances[input.memberId] ?? 0) < reward.cost) throw new DemoError("notEnoughPoints");
  earn(s, input.memberId, -reward.cost);
});

export const setRewardMode: typeof Real.setRewardMode = act(S.rewardMode, (s, input) => {
  s.household.rewardMode = input.mode;
  if (input.pointValue !== undefined) s.household.pointValue = input.pointValue;
});

export const saveReward: typeof Real.saveReward = act(S.reward, (s, input) => {
  const data = { emoji: input.emoji, title: input.title, cost: input.cost };
  if (input.id) s.rewards = s.rewards.map((r) => (r.id === input.id ? { ...r, ...data } : r));
  else s.rewards.push({ id: newId(s, "r"), ...data });
});

export const deleteReward: typeof Real.deleteReward = act(S.byId, (s, input) => {
  s.rewards = s.rewards.filter((r) => r.id !== input.id);
});

// ── Shopping ────────────────────────────────────────────────────────────────
export const addShoppingItem: typeof Real.addShoppingItem = act(S.shoppingAdd, (s, input) => {
  if (s.shoppingItems.some((i) => i.id === input.id)) return;
  const list = s.shoppingLists.find((l) => l.id === input.listId);
  if (!list) throw notFound();
  s.shoppingItems.unshift({ id: input.id, listId: input.listId, name: input.name, qty: input.qty, memberId: input.memberId, category: guessCategory(input.name, list.name), done: false });
});

export const setShoppingDone: typeof Real.setShoppingDone = act(S.shoppingDone, (s, input) => {
  s.shoppingItems = s.shoppingItems.map((i) => (i.id === input.id ? { ...i, done: input.done } : i));
});

export const clearDoneShopping: typeof Real.clearDoneShopping = act(S.shoppingClear, (s, input) => {
  s.shoppingItems = s.shoppingItems.filter((i) => !(i.listId === input.listId && i.done));
});

export const deleteShoppingItem: typeof Real.deleteShoppingItem = act(S.byId, (s, input) => {
  s.shoppingItems = s.shoppingItems.filter((i) => i.id !== input.id);
});

export const saveShoppingList: typeof Real.saveShoppingList = act(S.shoppingList, (s, input) => {
  const data = { name: input.name, icon: input.icon };
  if (input.id) s.shoppingLists = s.shoppingLists.map((l) => (l.id === input.id ? { ...l, ...data } : l));
  else s.shoppingLists.push({ id: newId(s, "list"), ...data });
});

export const deleteShoppingList: typeof Real.deleteShoppingList = act(S.byId, (s, input) => {
  if (s.shoppingLists.length <= 1) throw new DemoError("invalid");
  s.shoppingLists = s.shoppingLists.filter((l) => l.id !== input.id);
  s.shoppingItems = s.shoppingItems.filter((i) => i.listId !== input.id);
});

// ── Tasks ───────────────────────────────────────────────────────────────────
export const addTask: typeof Real.addTask = act(S.taskAdd, (s, input) => {
  if (s.tasks.some((t) => t.id === input.id)) return;
  s.tasks.unshift({ id: input.id, title: input.title, memberId: input.memberId, due: input.due, done: false });
});

export const setTaskDone: typeof Real.setTaskDone = act(S.taskDone, (s, input) => {
  s.tasks = s.tasks.map((t) => (t.id === input.id ? { ...t, done: input.done } : t));
});

export const deleteTask: typeof Real.deleteTask = act(S.byId, (s, input) => {
  s.tasks = s.tasks.filter((t) => t.id !== input.id);
});

// ── Dashboard, photos, household ────────────────────────────────────────────
export const saveWidgets: typeof Real.saveWidgets = act(S.widgets, (s, input) => {
  s.household.widgets = input.widgets;
});

export const saveWallTiles: typeof Real.saveWallTiles = act(S.wallTiles, (s, input) => {
  s.household.wallTiles = input.tiles;
});

export const updateAlbum: typeof Real.updateAlbum = act(S.album, (s, input) => {
  s.albums = s.albums.map((a) => (a.id === input.id ? { ...a, selected: input.selected ?? a.selected, weight: input.weight ?? a.weight } : a));
});

export const setPhotoPrefs: typeof Real.setPhotoPrefs = act(S.photoPrefs, (s, input) => {
  const h = s.household;
  if (input.idleMinutes !== undefined) h.idleMinutes = input.idleMinutes;
  if (input.showPhotoMeta !== undefined) h.showPhotoMeta = input.showPhotoMeta;
  h.night = { on: input.nightOn ?? h.night.on, from: input.nightFrom ?? h.night.from, until: input.nightUntil ?? h.night.until };
});

export const updateHousehold: typeof Real.updateHousehold = act(S.household, (s, input) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    throw new DemoError("invalid");
  }
  Object.assign(s.household, { name: input.name, timezone: input.timezone, location: input.location || undefined });
});

export const setDayTimes: typeof Real.setDayTimes = act(S.dayTimes, (s, input) => {
  Object.assign(s.household, input);
});

export const setHolidayFeeds: typeof Real.setHolidayFeeds = act(S.holidayFeeds, (s, input) => {
  s.household.holidayIcsUrls = [...new Set(input.urls.map((u) => u.trim()).filter(Boolean))];
});

/** Fetching the feeds needs a server; the demo keeps them as entered. */
export const syncHolidaysNow: typeof Real.syncHolidaysNow = act(z.object({}), () => {
  throw new DemoError("demo");
});

// ── Members ─────────────────────────────────────────────────────────────────
/** Anna's login is the demo's only one, and a household always keeps an admin who can sign in. */
function assertAnotherAdminLogin(s: DemoState, memberId: string) {
  if (memberId === "anna") throw new DemoError("invalid");
}

export const saveMember: typeof Real.saveMember = act(S.member, (s, input) => {
  // Logins need a server: the demo keeps people without one.
  if (input.email) throw new DemoError("demo");
  const data = { name: input.name, role: input.role, color: input.color, avatar: input.avatar, birthday: input.birthday };
  if (input.id) {
    if (input.role !== "admin") assertAnotherAdminLogin(s, input.id);
    s.members = s.members.map((m) => (m.id === input.id ? { ...m, ...data } : m));
    return input.id;
  }
  const id = newId(s, "m");
  s.members.push({ id, ...data, routineRewards: { on: false, points: 5 } });
  return id;
});

export const deleteMember: typeof Real.deleteMember = act(S.byId, (s, input) => {
  assertAnotherAdminLogin(s, input.id);
  s.members = s.members.filter((m) => m.id !== input.id);
  s.routines = s.routines.filter((r) => r.memberId !== input.id);
  s.chores = s.chores.filter((c) => c.memberId !== input.id);
  s.tasks = s.tasks.map((t) => (t.memberId === input.id ? { ...t, memberId: null } : t));
  s.events = s.events.map((e) => ({ ...e, memberIds: e.memberIds.filter((m) => m !== input.id) }));
  delete s.balances[input.id];
});

// ── Routines and chores ─────────────────────────────────────────────────────
/** The member's routine for a period and rhythm, started when there is none (D50). */
function routineFor(s: DemoState, memberId: string, period: z.output<typeof S.routineStep>["period"], recurrence: Recurrence) {
  const same = s.routines.find((r) => r.memberId === memberId && r.period === period && sameRecurrence(r.recurrence, recurrence));
  if (same) return same;
  const r = { id: newId(s, "routine"), memberId, period, recurrence: normalizeRecurrence(recurrence), items: [] };
  s.routines.push(r);
  return r;
}

/** A routine left without steps goes. */
const compact = (s: DemoState) => (s.routines = s.routines.filter((r) => r.items.length));

export const saveRoutineStep: typeof Real.saveRoutineStep = act(S.routineStep, (s, input) => {
  const own: TaskValue = input.points == null ? { kind: "expected" } : { kind: "extra", points: input.points, needsApproval: false };
  const data = { pictogram: input.pictogram, label: input.label as Text, own, value: own };
  if (input.stepId) {
    const from = s.routines.find((r) => r.items.some((i) => i.id === input.stepId));
    if (!from) throw notFound();
    const to = routineFor(s, from.memberId, input.period, input.recurrence as Recurrence);
    const step = { ...from.items.find((i) => i.id === input.stepId)!, ...data };
    if (to === from) from.items = from.items.map((i) => (i.id === step.id ? step : i));
    else {
      from.items = from.items.filter((i) => i.id !== step.id);
      to.items.push(step);
      compact(s);
    }
    return { routineId: to.id, stepId: step.id };
  }
  const to = routineFor(s, input.memberId, input.period, input.recurrence as Recurrence);
  const step = { id: newId(s, "step"), ...data };
  to.items.push(step);
  return { routineId: to.id, stepId: step.id };
});

export const addRoutineSteps: typeof Real.addRoutineSteps = act(S.routineSteps, (s, input) => {
  for (const memberId of new Set(input.memberIds)) {
    const to = routineFor(s, memberId, input.period, input.recurrence as Recurrence);
    for (const st of input.steps) to.items.push({ id: newId(s, "step"), pictogram: st.pictogram, label: st.label as Text, own: { kind: "expected" }, value: { kind: "expected" } });
  }
});

export const deleteRoutineStep: typeof Real.deleteRoutineStep = act(S.byId, (s, input) => {
  s.routines = s.routines.map((r) => ({ ...r, items: r.items.filter((i) => i.id !== input.id) }));
  compact(s);
});

export const setRoutineRewards: typeof Real.setRoutineRewards = act(S.routineRewards, (s, input) => {
  const m = s.members.find((x) => x.id === input.memberId);
  if (!m) throw notFound();
  m.routineRewards = { on: input.on, points: input.points };
});

export const saveChore: typeof Real.saveChore = act(S.chore, (s, input) => {
  const fields = { memberId: input.memberId, recurrence: input.recurrence as Recurrence };
  const item = { pictogram: input.pictogram, label: input.label as Text, value: input.value };
  if (input.id) s.chores = s.chores.map((c) => (c.id === input.id ? { ...c, ...fields, item: { ...c.item, ...item } } : c));
  else {
    const id = newId(s, "chore");
    s.chores.push({ id, ...fields, item: { id, ...item } });
  }
});

export const deleteChore: typeof Real.deleteChore = act(S.byId, (s, input) => {
  s.chores = s.chores.filter((c) => c.id !== input.id);
});

// ── Meals and dates ─────────────────────────────────────────────────────────
export const saveMeal: typeof Real.saveMeal = act(S.meal, (s, input) => {
  s.meals = s.meals.filter((m) => m.day !== input.day);
  if (isBlankText(input.dinner)) return;
  s.meals.push({ day: input.day, dinner: input.dinner, cookId: input.cookId ?? undefined, note: isBlankText(input.note) ? undefined : input.note });
  s.meals.sort((a, b) => a.day.localeCompare(b.day));
});

export const saveImportantDate: typeof Real.saveImportantDate = act(S.importantDate, (s, input) => {
  const data = { kind: input.kind, title: input.title, date: input.date, yearly: input.yearly, memberId: input.memberId ?? undefined };
  if (input.id) s.dates = s.dates.map((d) => (d.id === input.id ? { ...d, ...data } : d));
  else s.dates.push({ id: newId(s, "date"), ...data });
});

export const deleteImportantDate: typeof Real.deleteImportantDate = act(S.byId, (s, input) => {
  s.dates = s.dates.filter((d) => d.id !== input.id);
});

// ── Calendar ────────────────────────────────────────────────────────────────
function changeable(s: DemoState, id: string) {
  const existing = s.events.find((e) => e.id === id);
  if (!existing) return null;
  if (!eventAccess(s.sources.find((x) => x.id === existing.sourceId), existing).editable) throw new DemoError("readOnly");
  return existing;
}

export const saveEvent: typeof Real.saveEvent = act(S.event, (s, input) => {
  const source = s.sources.find((x) => x.id === input.sourceId);
  if (!source) throw notFound();
  if (source.readOnly) throw new DemoError("readOnly");
  const { scope: _scope, id, ...rest } = input;
  const e = { ...rest, location: input.location || undefined, allDay: input.allDay || undefined };
  const stored = { ...e, ...allDayForStorage(e) };
  if (id) {
    const existing = changeable(s, id);
    if (!existing) throw notFound();
    if (existing.sourceId !== input.sourceId) throw new DemoError("invalid");
    s.events = s.events.map((x) => (x.id === id ? { ...x, ...stored } : x));
    return id;
  }
  const newOne = { id: newId(s, "ev"), ...stored };
  s.events.push(newOne);
  s.events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return newOne.id;
});

export const deleteEvent: typeof Real.deleteEvent = act(S.eventDelete, (s, input) => {
  if (!changeable(s, input.id)) return;
  s.events = s.events.filter((e) => e.id !== input.id);
});

// ── Photos ──────────────────────────────────────────────────────────────────
/** The demo's photos are drawn on the device (`seed`), so no picture leaves this page. */
export const getPhotoPlaylist: typeof Real.getPhotoPlaylist = async () => {
  const s = load();
  const byAlbum = new Map<string, Photo[]>();
  for (const p of s.photos) byAlbum.set(p.albumId, [...(byAlbum.get(p.albumId) ?? []), p]);
  return weightedPlaylist(s.albums, (id) => byAlbum.get(id) ?? [], 48);
};
