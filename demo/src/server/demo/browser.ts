import { ZodError, type z } from "zod";
import type {
  ActionResult, Completion, ContactBirthday, HouseholdSettings, HouseholdWire, Integration, Member, Photo, Routine, TaskValue,
} from "@/lib/types";
import { addDays, at, dateKey, startOfDay } from "@/lib/dates";
import { allDayForStorage } from "@/lib/events";
import { routineStepValue } from "@/lib/ledger";
import { completeWallTiles, completeWidgets } from "@/lib/dashboard";
import {
  DEFAULT_WIDGETS, DEMO_BALANCES, DEMO_DONE_TODAY, DEMO_LISTS, DEMO_PENDING, DEMO_REWARDS, DEMO_SOURCES, FAMILY_NAME,
  demoAlbums, demoChores, demoContacts, demoDates, demoEvents, demoMeals, demoMembers, demoPhotos, demoRoutines, demoShopping, demoTasks, demoWeather,
} from "@/server/demo/data";

/**
 * The static demo's "server" (§20 D74): the Müller family, kept in this
 * browser's localStorage instead of PostgreSQL. It stands in for the Server
 * Actions in the GitHub Pages build only (`scripts/build-demo.mjs`), so the
 * real screens run unchanged against it. Seeded from the same data as the
 * Docker demo, relative to today; a new day or "Reset" seeds it again.
 */
const KEY = "kindo.demo";
/** Bump when the stored shape changes, so old browsers start fresh. */
const VERSION = 1;

type StoredCompletion = Completion & { value: TaskValue };
export interface DemoState {
  v: number;
  /** The day the family was seeded for. */
  day: string;
  household: HouseholdSettings;
  members: Member[];
  routines: Routine[];
  chores: HouseholdWire["chores"];
  completions: StoredCompletion[];
  balances: Record<string, number>;
  rewards: HouseholdWire["rewards"];
  tasks: HouseholdWire["tasks"];
  shoppingLists: HouseholdWire["shoppingLists"];
  shoppingItems: HouseholdWire["shoppingItems"];
  meals: HouseholdWire["meals"];
  dates: HouseholdWire["dates"];
  birthdays: ContactBirthday[];
  sources: HouseholdWire["sources"];
  /** As stored: all-day events at UTC midnight, like the server sends them. */
  events: HouseholdWire["events"];
  albums: HouseholdWire["albums"];
  photos: Photo[];
  pin: string | null;
  seq: number;
}

/** A fresh Müller family for `now`, as `seedDemo` loads it into the database. */
export function seed(now = new Date()): DemoState {
  const today = startOfDay(now);
  const day = dateKey(today);
  const routines = demoRoutines().map((r) => ({ ...r, items: r.items.map((i) => ({ ...i, own: i.value })) }));
  const chores = demoChores(today);
  const completions: StoredCompletion[] = [];
  for (const [routineId, count] of Object.entries(DEMO_DONE_TODAY)) {
    const r = routines.find((x) => x.id === routineId)!;
    for (const s of r.items.slice(0, count)) {
      completions.push({ id: `c-${s.id}`, itemId: s.id, memberId: r.memberId, day, status: "done", pictogram: s.pictogram, label: s.label, value: s.value, at: at(today, 7, 10) });
    }
  }
  for (const p of DEMO_PENDING) {
    const c = chores.find((x) => x.id === p.itemId)!;
    completions.push({ id: `c-${c.id}`, itemId: c.id, memberId: p.memberId, day, status: "pending", pictogram: c.item.pictogram, label: c.item.label, value: c.item.value, at: at(today, p.hour, p.minute) });
  }
  return {
    v: VERSION,
    day,
    household: {
      name: FAMILY_NAME, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin", location: "Freiburg",
      rewardMode: "stars", pointValue: 0.05, idleMinutes: 2, showPhotoMeta: true,
      night: { on: false, from: "22:00", until: "06:00" }, mediaPin: "off", mediaScreen: true,
      widgets: completeWidgets(DEFAULT_WIDGETS), wallTiles: completeWallTiles([]), demo: true,
      dayStartsAt: "03:00", morningUntil: "11:00", afternoonUntil: "17:00", holidayIcsUrls: [],
    },
    members: demoMembers(today).map((m) => ({ ...m, routineRewards: { on: false, points: 5 } })),
    routines,
    chores,
    completions,
    balances: { ...DEMO_BALANCES },
    rewards: DEMO_REWARDS.map((r) => ({ ...r })),
    tasks: demoTasks(today),
    shoppingLists: DEMO_LISTS.map((l) => ({ ...l })),
    shoppingItems: demoShopping(),
    meals: demoMeals(today),
    dates: demoDates(today),
    birthdays: demoContacts(today).map(({ uid, ...c }) => ({ id: uid, ...c })),
    sources: DEMO_SOURCES.map((s) => ({ ...s })),
    events: demoEvents(today).map((e) => ({ ...e, ...allDayForStorage(e) })),
    albums: demoAlbums(today),
    photos: demoPhotos(today).map((p) => ({ id: p.id, albumId: p.albumId, seed: p.seed, takenAt: p.takenAt, place: p.place })),
    pin: null,
    seq: 0,
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
let memory: DemoState | null = null;

/** The demo household; a stored one from an earlier day or version is replaced by a fresh one. */
export function load(now = new Date()): DemoState {
  const today = dateKey(startOfDay(now));
  if (memory?.day === today) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw, (_k, v) => (typeof v === "string" && ISO.test(v) ? new Date(v) : v)) as DemoState) : null;
    if (s?.v === VERSION && s.day === today) return (memory = s);
  } catch {}
  memory = seed(now);
  save(memory);
  return memory;
}

export function save(s: DemoState) {
  memory = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

/** Forgets every change: the next read seeds the family again. */
export function reset() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export const newId = (s: DemoState, prefix: string) => `${prefix}-${Date.now().toString(36)}-${++s.seq}`;

/** The household as Anna, the demo's admin, sees it: what `loadSnapshot` returns on a server. */
export function snapshot(now = new Date()): HouseholdWire {
  const s = load(now);
  const today = startOfDay(now);
  const since = dateKey(addDays(today, -35));
  const rewardsOf = new Map(s.members.map((m) => [m.id, m.routineRewards]));
  return {
    generatedAt: new Date(),
    household: { ...s.household },
    viewer: { kind: "user", name: "Anna", memberId: "anna", role: "admin", canManage: true, isAdmin: true, pinSet: s.pin !== null },
    members: s.members.map((m) => ({ ...m, account: m.id === "anna" ? { email: "anna@demo.kindo" } : undefined })),
    routines: s.routines.map((r) => ({
      ...r,
      items: r.items.map((i) => ({ ...i, value: routineStepValue(i.own ?? { kind: "expected" }, rewardsOf.get(r.memberId), s.household.rewardMode) })),
    })),
    chores: s.chores,
    tasks: s.tasks,
    rewards: s.rewards,
    balances: { ...s.balances },
    approvals: s.completions
      .filter((c) => c.status === "pending" && c.memberId)
      .map((c) => ({ id: c.id, memberId: c.memberId!, day: c.day, at: c.at, item: { id: c.itemId, pictogram: c.pictogram, label: c.label, value: c.value } })),
    completions: s.completions.filter((c) => c.day >= since || c.status === "pending").map(({ value: _value, ...c }) => c),
    shoppingLists: s.shoppingLists,
    shoppingItems: s.shoppingItems,
    meals: s.meals,
    dates: s.dates,
    birthdays: s.birthdays,
    sources: s.sources,
    events: s.events,
    albums: s.albums,
    holidays: [],
    weather: demoWeather(today),
    integrations: DEMO_INTEGRATIONS,
    connections: [],
    features: { google: false },
    home: null,
    cameras: [],
    media: null,
    voice: false,
  };
}

const DEMO_INTEGRATIONS: Integration[] = [
  { id: "nextcloud", status: "connected", detail: { en: "Demo: 2 calendars", de: "Demo: 2 Kalender" } },
  { id: "immich", status: "connected", detail: { en: "Demo: 2 servers, 4 albums in rotation", de: "Demo: 2 Server, 4 Alben in Rotation" } },
  { id: "google", status: "partial", detail: { en: "Demo: 1 read-only calendar", de: "Demo: 1 Kalender, nur lesen" } },
  { id: "ics", status: "connected", detail: { en: "Demo: school, waste collection", de: "Demo: Schule, Abfallkalender" } },
  { id: "homeassistant", status: "off" },
  { id: "frigate", status: "off" },
  { id: "jellyfin", status: "off" },
  { id: "audiobookshelf", status: "off" },
];

/** A rule the demo enforces, as an error code the UI translates (like the server's `UserError`). */
export class DemoError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** What the demo can't do: everything that would reach a server of the household's own. */
export const notInDemo = async (): Promise<{ ok: false; error: string }> => ({ ok: false, error: "demo" });

/**
 * The demo's stand-in for `act`: parses the input with the server's own
 * schema, runs the rule against the stored household, and saves it.
 */
export function act<Schema extends z.ZodType, R>(schema: Schema, fn: (s: DemoState, input: z.output<Schema>) => R) {
  return async (input: z.input<Schema>): Promise<ActionResult<R>> => {
    try {
      const data = schema.parse(input);
      const s = load();
      const result = fn(s, data);
      save(s);
      return { ok: true, data: result };
    } catch (e) {
      if (e instanceof DemoError) return { ok: false, error: e.code };
      if (e instanceof ZodError) return { ok: false, error: "invalid" };
      console.error("demo action failed", e);
      return { ok: false, error: "server" };
    }
  };
}
