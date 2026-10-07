import type {
  ApprovalRequest, CalendarSource, Chore, Completion, HouseholdWire, ImportantDate, Integration, Member, OneOffTask,
  Recurrence, Routine, ShoppingCategory, TaskItem, TaskValue, Text, Viewer, WidgetConfig,
} from "@/lib/types";
import { addDays, dateKey, startOfDay } from "@/lib/dates";
import type { Tx } from "./db";
import { fromStoredEvent } from "./events";
import { demoWeather } from "./demo/data";

/** How far back completions travel to the devices: enough for a two-week history view. */
export const HISTORY_DAYS = 35;
/** Calendar window sent to the devices. Wider ranges are fetched on demand later. */
export const EVENTS_BEFORE_DAYS = 90;
export const EVENTS_AFTER_DAYS = 400;

const value = (v: unknown) => v as TaskValue;

/**
 * Everything the screens need, in one query batch (§19.2). Only what a device
 * may see goes in here: no secrets, no tokens, no connection details (§17).
 */
export async function loadSnapshot(db: Tx, viewer: Viewer, now = new Date()): Promise<HouseholdWire | null> {
  const household = await db.household.findUnique({ where: { id: 1 } });
  if (!household) return null;
  const today = startOfDay(now);
  const sinceDay = dateKey(addDays(today, -HISTORY_DAYS));

  const [members, routines, chores, completions, points, rewards, tasks, lists, items, meals, dates, sources, events, albums, holidays] = await Promise.all([
    db.member.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { user: { select: { email: true } } } }),
    db.routine.findMany({ include: { steps: { orderBy: { position: "asc" } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.chore.findMany({ orderBy: { createdAt: "asc" } }),
    // Pending approvals are always included, however old: someone still has to answer them.
    db.completion.findMany({ where: { OR: [{ day: { gte: sinceDay } }, { status: "pending" }] }, orderBy: { at: "asc" } }),
    db.pointsEntry.groupBy({ by: ["memberId"], _sum: { delta: true } }),
    db.reward.findMany({ where: { archived: false }, orderBy: [{ sortOrder: "asc" }, { cost: "asc" }] }),
    db.task.findMany({ orderBy: { createdAt: "desc" } }),
    db.shoppingList.findMany({ orderBy: { sortOrder: "asc" } }),
    db.shoppingItem.findMany({ orderBy: { createdAt: "desc" } }),
    db.meal.findMany({ where: { day: { gte: dateKey(addDays(today, -14)) } }, orderBy: { day: "asc" } }),
    db.importantDate.findMany(),
    db.calendarSource.findMany({ orderBy: { sortOrder: "asc" } }),
    db.event.findMany({
      where: { end: { gte: addDays(today, -EVENTS_BEFORE_DAYS) }, start: { lte: addDays(today, EVENTS_AFTER_DAYS) } },
      orderBy: { start: "asc" },
    }),
    db.photoAlbum.findMany({ orderBy: [{ server: "asc" }, { name: "asc" }] }),
    db.holidayRange.findMany({ where: { end: { gte: sinceDay } }, orderBy: { start: "asc" } }),
  ]);

  const routineItems: Routine[] = routines.map((r) => ({
    id: r.id, memberId: r.memberId, period: r.period, recurrence: r.recurrence as unknown as Recurrence,
    items: r.steps.map((s): TaskItem => ({ id: s.id, pictogram: s.pictogram, label: s.label as Text, value: value(s.value) })),
  }));

  const completionList: Completion[] = completions.map((c) => ({
    id: c.id, itemId: c.itemId, memberId: c.memberId, day: c.day, status: c.status, pictogram: c.pictogram, label: c.label as Text, at: c.at,
  }));
  const approvals: ApprovalRequest[] = completions
    .filter((c) => c.status === "pending" && c.memberId)
    .map((c) => ({ id: c.id, memberId: c.memberId!, day: c.day, at: c.at, item: { id: c.itemId, pictogram: c.pictogram, label: c.label as Text, value: value(c.value) } }));

  return {
    household: {
      name: household.name, timezone: household.timezone, location: household.location ?? undefined, rewardMode: household.rewardMode,
      pointValue: household.pointValue, idleMinutes: household.idleMinutes, showPhotoMeta: household.showPhotoMeta,
      widgets: household.widgets as unknown as WidgetConfig[], demo: household.demo,
      dayStartsAt: household.dayStartsAt, morningUntil: household.morningUntil, afternoonUntil: household.afternoonUntil,
      holidayIcsUrls: household.holidayIcsUrls, holidaysSyncedAt: household.holidaysSyncedAt ?? undefined, holidaysError: household.holidaysError ?? undefined,
    },
    viewer,
    members: members.map((m): Member => ({
      id: m.id, name: m.name, role: m.role, color: m.color, avatar: m.avatar as Member["avatar"], birthday: m.birthday ?? undefined,
      account: m.user ? { email: m.user.email } : undefined,
    })),
    routines: routineItems,
    chores: chores.map((c): Chore => ({
      id: c.id, memberId: c.memberId, recurrence: c.recurrence as unknown as Recurrence,
      item: { id: c.id, pictogram: c.pictogram, label: c.label as Text, value: value(c.value) },
    })),
    tasks: tasks.map((t): OneOffTask => ({ id: t.id, title: t.title as Text, memberId: t.memberId, due: t.due ?? undefined, done: t.done })),
    rewards: rewards.map((r) => ({ id: r.id, emoji: r.emoji, title: r.title as Text, cost: r.cost })),
    balances: Object.fromEntries(points.map((p) => [p.memberId, p._sum.delta ?? 0])),
    approvals,
    completions: completionList,
    shoppingLists: lists.map((l) => ({ id: l.id, name: l.name as Text, icon: l.icon })),
    shoppingItems: items.map((s) => ({
      id: s.id, listId: s.listId, name: s.name as Text, qty: s.qty ?? undefined, category: s.category as ShoppingCategory, memberId: s.memberId ?? undefined, done: s.done,
    })),
    // `date` is filled in on the device, which knows its own time zone.
    meals: meals.map((m) => ({ day: m.day, dinner: m.dinner as Text, cookId: m.cookId ?? undefined, note: (m.note as Text | null) ?? undefined })),
    dates: dates.map((d): ImportantDate => ({ id: d.id, kind: d.kind, title: d.title as Text, date: d.date, yearly: d.yearly, memberId: d.memberId ?? undefined })),
    sources: sources.map((s): CalendarSource => ({
      id: s.id, provider: s.provider, name: s.name as Text, account: s.account ?? undefined, defaultMemberIds: s.defaultMemberIds, readOnly: s.readOnly,
    })),
    events: events.map(fromStoredEvent),
    albums: albums.map((a) => ({ id: a.id, server: a.server, name: a.name, count: a.count, selected: a.selected, weight: a.weight })),
    holidays: holidays.map((h) => ({ start: h.start, end: h.end, summary: h.summary })),
    weather: household.demo ? demoWeather(today) : null,
    integrations: integrationsFor(household.demo),
  };
}

/** Integration status for Settings. Real connections arrive with steps 5–8 of the roadmap. */
function integrationsFor(demo: boolean): Integration[] {
  const ids: Integration["id"][] = ["nextcloud", "immich", "google", "ics", "homeassistant"];
  if (!demo) return ids.map((id) => ({ id, status: "off" }));
  return [
    { id: "nextcloud", status: "connected", detail: { en: "Demo: 2 calendars", de: "Demo: 2 Kalender" } },
    { id: "immich", status: "connected", detail: { en: "Demo: 2 servers, 4 albums in rotation", de: "Demo: 2 Server, 4 Alben in Rotation" } },
    { id: "google", status: "partial", detail: { en: "Demo: 1 read-only calendar", de: "Demo: 1 Kalender, nur lesen" } },
    { id: "ics", status: "connected", detail: { en: "Demo: school, waste collection", de: "Demo: Schule, Abfallkalender" } },
    { id: "homeassistant", status: "off" },
  ];
}
