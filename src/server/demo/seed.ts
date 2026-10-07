import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { addDays, at, dateKey, startOfDay } from "@/lib/dates";
import { toStoredEvent } from "../events";
import {
  DEFAULT_WIDGETS, DEMO_BALANCES, DEMO_DONE_TODAY, DEMO_LISTS, DEMO_PENDING, DEMO_REWARDS, DEMO_SOURCES, FAMILY_NAME,
  demoAlbums, demoChores, demoDates, demoEvents, demoMeals, demoMembers, demoPhotos, demoRoutines, demoShopping, demoTasks,
} from "./data";

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** The pieces every new household starts with: one shopping list and Kindo's own calendar. */
export async function createHousehold(db: Tx, opts: { name: string; timezone: string; location?: string; demo?: boolean }) {
  await db.household.create({
    data: { id: 1, name: opts.name, timezone: opts.timezone, location: opts.location, widgets: json(DEFAULT_WIDGETS), demo: opts.demo ?? false },
  });
  if (!opts.demo) {
    await db.shoppingList.create({ data: { name: json({ en: "Groceries", de: "Lebensmittel" }), icon: "🥕" } });
    await db.calendarSource.create({ data: { id: "local", provider: "local", name: json("Kindo"), defaultMemberIds: [], readOnly: false } });
  }
}

/** Is there a household yet? Everything else waits for first-run setup until there is. */
export const hasHousehold = async (db: Tx) => (await db.household.count()) > 0;

/**
 * Loads the Müller family into an empty database (§20 D11). Refuses to run
 * over an existing household so it can never mix into real data.
 */
export async function seedDemo(db: Tx, now = new Date(), timezone = process.env.TZ || "Europe/Berlin") {
  if (await hasHousehold(db)) throw new Error("This database already has a household; the demo only loads into an empty one.");
  const today = startOfDay(now);
  await createHousehold(db, { name: FAMILY_NAME, timezone, location: "Freiburg", demo: true });

  const members = demoMembers(today);
  await db.member.createMany({
    data: members.map((m, i) => ({ id: m.id, name: m.name, role: m.role, color: m.color, avatar: json(m.avatar), birthday: m.birthday, sortOrder: i })),
  });

  const routines = demoRoutines();
  for (const [i, r] of routines.entries()) {
    await db.routine.create({
      data: {
        id: r.id, memberId: r.memberId, period: r.period, recurrence: json(r.recurrence), sortOrder: i,
        steps: { create: r.items.map((s, position) => ({ id: s.id, position, pictogram: s.pictogram, label: json(s.label), value: json(s.value) })) },
      },
    });
  }
  const chores = demoChores(today);
  await db.chore.createMany({
    data: chores.map((c) => ({ id: c.id, memberId: c.memberId, pictogram: c.item.pictogram, label: json(c.item.label), value: json(c.item.value), recurrence: json(c.recurrence) })),
  });

  // Today's progress, so the demo doesn't start blank.
  const day = dateKey(today);
  for (const [routineId, count] of Object.entries(DEMO_DONE_TODAY)) {
    const r = routines.find((x) => x.id === routineId)!;
    for (const s of r.items.slice(0, count)) {
      await db.completion.create({ data: { itemId: s.id, memberId: r.memberId, day, status: "done", pictogram: s.pictogram, label: json(s.label), value: json(s.value), at: at(today, 7, 10) } });
    }
  }
  for (const p of DEMO_PENDING) {
    const c = chores.find((x) => x.id === p.itemId)!;
    await db.completion.create({
      data: { itemId: c.id, memberId: p.memberId, day, status: "pending", pictogram: c.item.pictogram, label: json(c.item.label), value: json(c.item.value), at: at(today, p.hour, p.minute) },
    });
  }
  await db.pointsEntry.createMany({ data: Object.entries(DEMO_BALANCES).map(([memberId, delta]) => ({ memberId, delta, reason: "adjust" as const })) });
  await db.reward.createMany({ data: DEMO_REWARDS.map((r, i) => ({ id: r.id, emoji: r.emoji, title: json(r.title), cost: r.cost, sortOrder: i })) });

  await db.task.createMany({ data: demoTasks(today).map((t) => ({ id: t.id, title: json(t.title), memberId: t.memberId, due: t.due, done: t.done, doneAt: t.done ? addDays(today, -2) : null })) });

  await db.shoppingList.createMany({ data: DEMO_LISTS.map((l, i) => ({ id: l.id, name: json(l.name), icon: l.icon, sortOrder: i })) });
  // Newest first on screen, so createdAt follows the list order backwards.
  const items = demoShopping();
  await db.shoppingItem.createMany({
    data: items.map((s, i) => ({
      id: s.id, listId: s.listId, name: json(s.name), qty: s.qty, category: s.category, memberId: s.memberId, done: s.done,
      createdAt: new Date(now.getTime() - i * 60_000),
    })),
  });

  await db.meal.createMany({ data: demoMeals(today).map((m) => ({ day: m.day, dinner: json(m.dinner), cookId: m.cookId, note: m.note === undefined ? undefined : json(m.note) })) });
  await db.importantDate.createMany({ data: demoDates(today).map((d) => ({ id: d.id, kind: d.kind, title: json(d.title), date: d.date, yearly: d.yearly, memberId: d.memberId })) });

  await db.calendarSource.createMany({
    data: DEMO_SOURCES.map((s, i) => ({ id: s.id, provider: s.provider, name: json(s.name), account: s.account, defaultMemberIds: s.defaultMemberIds, readOnly: s.readOnly, sortOrder: i })),
  });
  await db.event.createMany({ data: demoEvents(today).map((e) => ({ id: e.id, ...toStoredEvent(e) })) });

  await db.photoAlbum.createMany({ data: demoAlbums(today).map((a) => ({ id: a.id, server: a.server, name: a.name, count: a.count, selected: a.selected, weight: a.weight })) });
  await db.photoAsset.createMany({ data: demoPhotos(today) });
}
