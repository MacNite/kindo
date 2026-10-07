import { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { TaskValue, Text } from "@/lib/types";
import { guessCategory } from "@/lib/shopping";
import { completionOutcome } from "@/lib/ledger";
import { prisma, type Tx } from "./db";
import { UserError, notFound } from "./errors";
import { toStoredEvent } from "./events";
import type { S } from "./validation";

/**
 * Household mutations (§19.2). Plain functions over a database handle, so the
 * rules are testable without a request; `actions/*.ts` wraps them as Server
 * Actions. Every write is idempotent where the device might retry it
 * (offline replay, double taps): "set done", not "toggle".
 */
type In<K extends keyof typeof S> = z.output<(typeof S)[K]>;
const json = (v: unknown) => v as Prisma.InputJsonValue;
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const isMissing = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";

/** Runs `fn` in a transaction when given the root client; inside one already, just runs it. */
async function inTx<T>(db: Tx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return "$transaction" in db ? (db as typeof prisma).$transaction((tx) => fn(tx)) : fn(db);
}

// ── Routines and chores: ticking off ────────────────────────────────────────
interface ItemInfo { pictogram: string; label: Text; value: TaskValue; ownerId: string | null }

async function findItem(db: Tx, itemId: string): Promise<ItemInfo | null> {
  const step = await db.routineStep.findUnique({ where: { id: itemId }, include: { routine: { select: { memberId: true } } } });
  if (step) return { pictogram: step.pictogram, label: step.label as Text, value: step.value as TaskValue, ownerId: step.routine.memberId };
  const chore = await db.chore.findUnique({ where: { id: itemId } });
  if (chore) return { pictogram: chore.pictogram, label: chore.label as Text, value: chore.value as TaskValue, ownerId: chore.memberId };
  return null;
}

/**
 * Ticks an item off for a household day, or unticks it (§9). Expected items
 * only record that they are done. Extras earn points, at once or after a
 * parent's OK; unticking withdraws the request and takes back what it earned.
 * The item's value always comes from the database, never from the device.
 */
export async function setCompletion(db: Tx, input: In<"completion">) {
  return inTx(db, async (tx) => {
    const existing = await tx.completion.findUnique({ where: { itemId_day: { itemId: input.itemId, day: input.day } } });
    if (!input.done) {
      if (existing) await tx.completion.delete({ where: { id: existing.id } });
      return;
    }
    if (existing) return;
    const item = await findItem(tx, input.itemId);
    if (!item) throw notFound("item");
    // A routine step or assigned chore always belongs to its owner; "anyone" chores to whoever says they did it.
    const memberId = item.ownerId ?? input.memberId ?? null;
    const outcome = completionOutcome(item.value, memberId !== null);
    try {
      await tx.completion.create({
        data: {
          itemId: input.itemId, memberId, day: input.day, status: outcome.status,
          pictogram: item.pictogram, label: json(item.label), value: json(item.value),
          points: outcome.points && memberId ? { create: { memberId, delta: outcome.points, reason: "earn" } } : undefined,
        },
      });
    } catch (e) {
      if (!isUnique(e)) throw e; // ticked twice at once: the first one counts
    }
  });
}

export async function resolveApproval(db: Tx, input: In<"resolveApproval">) {
  return inTx(db, async (tx) => {
    const c = await tx.completion.findUnique({ where: { id: input.id } });
    if (!c || c.status !== "pending") return; // already answered elsewhere
    if (!input.ok) {
      await tx.completion.delete({ where: { id: c.id } });
      return;
    }
    const v = c.value as TaskValue;
    await tx.completion.update({
      where: { id: c.id },
      data: {
        status: "done", resolvedAt: new Date(),
        points: v.kind === "extra" && v.points > 0 && c.memberId ? { create: { memberId: c.memberId, delta: v.points, reason: "earn" } } : undefined,
      },
    });
  });
}

// ── Rewards ─────────────────────────────────────────────────────────────────
export async function balanceOf(db: Tx, memberId: string) {
  const r = await db.pointsEntry.aggregate({ where: { memberId }, _sum: { delta: true } });
  return r._sum.delta ?? 0;
}

/** Spends points on a reward. The member row is locked so two screens can't spend the same points. */
export async function redeem(db: Tx, input: In<"redeem">) {
  return inTx(db, async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Member" WHERE id = ${input.memberId} FOR UPDATE`;
    if (!locked.length) throw notFound("member");
    const reward = await tx.reward.findUnique({ where: { id: input.rewardId } });
    if (!reward || reward.archived) throw notFound("reward");
    if ((await balanceOf(tx, input.memberId)) < reward.cost) throw new UserError("notEnoughPoints");
    await tx.pointsEntry.create({ data: { memberId: input.memberId, delta: -reward.cost, reason: "redeem", rewardId: reward.id } });
  });
}

export async function setRewardMode(db: Tx, input: In<"rewardMode">) {
  await db.household.update({ where: { id: 1 }, data: { rewardMode: input.mode, pointValue: input.pointValue } });
}

export async function saveReward(db: Tx, input: In<"reward">) {
  const data = { emoji: input.emoji, title: json(input.title), cost: input.cost };
  if (input.id) await db.reward.update({ where: { id: input.id }, data });
  else await db.reward.create({ data: { ...data, sortOrder: await db.reward.count() } });
}

/** Archived rather than deleted, so past redemptions keep pointing at something. */
export async function deleteReward(db: Tx, input: In<"byId">) {
  await db.reward.updateMany({ where: { id: input.id }, data: { archived: true } });
}

// ── Shopping ────────────────────────────────────────────────────────────────
/** The id comes from the device, so a replayed offline add is a no-op. */
export async function addShoppingItem(db: Tx, input: In<"shoppingAdd">) {
  try {
    await db.shoppingItem.create({
      data: { id: input.id, listId: input.listId, name: json(input.name), qty: input.qty, memberId: input.memberId, category: guessCategory(input.name, input.listId) },
    });
  } catch (e) {
    if (isUnique(e)) return;
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") throw notFound("list");
    throw e;
  }
}

export async function setShoppingDone(db: Tx, input: In<"shoppingDone">) {
  await db.shoppingItem.updateMany({ where: { id: input.id }, data: { done: input.done, doneAt: input.done ? new Date() : null } });
}

export async function clearDoneShopping(db: Tx, input: In<"shoppingClear">) {
  await db.shoppingItem.deleteMany({ where: { listId: input.listId, done: true } });
}

export async function deleteShoppingItem(db: Tx, input: In<"byId">) {
  await db.shoppingItem.deleteMany({ where: { id: input.id } });
}

export async function saveShoppingList(db: Tx, input: In<"shoppingList">) {
  const data = { name: json(input.name), icon: input.icon };
  if (input.id) await db.shoppingList.update({ where: { id: input.id }, data });
  else await db.shoppingList.create({ data: { ...data, sortOrder: await db.shoppingList.count() } });
}

export async function deleteShoppingList(db: Tx, input: In<"byId">) {
  if ((await db.shoppingList.count()) <= 1) throw new UserError("invalid", "the last list stays");
  await db.shoppingList.deleteMany({ where: { id: input.id } });
}

// ── Tasks ───────────────────────────────────────────────────────────────────
export async function addTask(db: Tx, input: In<"taskAdd">) {
  try {
    await db.task.create({ data: { id: input.id, title: json(input.title), memberId: input.memberId, due: input.due } });
  } catch (e) {
    if (!isUnique(e)) throw e;
  }
}

export async function setTaskDone(db: Tx, input: In<"taskDone">) {
  await db.task.updateMany({ where: { id: input.id }, data: { done: input.done, doneAt: input.done ? new Date() : null } });
}

export async function deleteTask(db: Tx, input: In<"byId">) {
  await db.task.deleteMany({ where: { id: input.id } });
}

// ── Dashboard, photos, household ────────────────────────────────────────────
export async function saveWidgets(db: Tx, input: In<"widgets">) {
  await db.household.update({ where: { id: 1 }, data: { widgets: json(input.widgets) } });
}

export async function updateAlbum(db: Tx, input: In<"album">) {
  await db.photoAlbum.updateMany({ where: { id: input.id }, data: { selected: input.selected, weight: input.weight } });
}

export async function setPhotoPrefs(db: Tx, input: In<"photoPrefs">) {
  await db.household.update({ where: { id: 1 }, data: input });
}

export async function updateHousehold(db: Tx, input: In<"household">) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    throw new UserError("invalid", "unknown time zone");
  }
  await db.household.update({ where: { id: 1 }, data: { name: input.name, timezone: input.timezone, location: input.location || null } });
}

// ── Members ─────────────────────────────────────────────────────────────────
export async function saveMember(db: Tx, input: In<"member">) {
  const data = { name: input.name, role: input.role, color: input.color, avatar: json(input.avatar), birthday: input.birthday ?? null };
  if (input.id) {
    if (input.role !== "admin") await assertAnotherAdmin(db, input.id);
    await db.member.update({ where: { id: input.id }, data });
    return input.id;
  }
  const m = await db.member.create({ data: { ...data, sortOrder: await db.member.count() } });
  return m.id;
}

export async function deleteMember(db: Tx, input: In<"byId">) {
  await assertAnotherAdmin(db, input.id);
  await db.member.deleteMany({ where: { id: input.id } });
}

/** A household always keeps at least one admin, or nobody could change settings any more. */
async function assertAnotherAdmin(db: Tx, memberId: string) {
  const me = await db.member.findUnique({ where: { id: memberId }, select: { role: true } });
  if (me?.role !== "admin") return;
  const others = await db.member.count({ where: { role: "admin", id: { not: memberId } } });
  if (!others) throw new UserError("invalid", "the last admin stays");
}

// ── Routines and chores: editing ────────────────────────────────────────────
/**
 * Saves one step of a routine. The routine's recurrence and period travel
 * with every step edit: the editor shows them together. Without a routine id
 * this starts a new routine for the member and period.
 */
export async function saveRoutineStep(db: Tx, input: In<"routineStep">) {
  return inTx(db, async (tx) => {
    let routineId = input.routineId;
    if (routineId) {
      const r = await tx.routine.update({ where: { id: routineId }, data: { recurrence: json(input.recurrence), period: input.period } }).catch((e) => {
        if (isMissing(e)) throw notFound("routine");
        throw e;
      });
      routineId = r.id;
    } else {
      const r = await tx.routine.create({ data: { memberId: input.memberId, period: input.period, recurrence: json(input.recurrence), sortOrder: await tx.routine.count() } });
      routineId = r.id;
    }
    // Routine steps are always expected: routines never earn points (§9).
    const data = { pictogram: input.pictogram, label: json(input.label), value: json({ kind: "expected" }) };
    if (input.stepId) {
      const n = await tx.routineStep.updateMany({ where: { id: input.stepId, routineId }, data });
      if (!n.count) throw notFound("step");
      return { routineId, stepId: input.stepId };
    }
    const position = await tx.routineStep.count({ where: { routineId } });
    const step = await tx.routineStep.create({ data: { ...data, routineId, position } });
    return { routineId, stepId: step.id };
  });
}

/** Deletes a step; a routine left without steps goes with it. */
export async function deleteRoutineStep(db: Tx, input: In<"byId">) {
  return inTx(db, async (tx) => {
    const step = await tx.routineStep.findUnique({ where: { id: input.id } });
    if (!step) return;
    await tx.routineStep.delete({ where: { id: step.id } });
    const left = await tx.routineStep.findMany({ where: { routineId: step.routineId }, orderBy: { position: "asc" } });
    if (!left.length) await tx.routine.delete({ where: { id: step.routineId } });
    else for (const [i, s] of left.entries()) if (s.position !== i) await tx.routineStep.update({ where: { id: s.id }, data: { position: i } });
  });
}

export async function saveChore(db: Tx, input: In<"chore">) {
  const data = { memberId: input.memberId, pictogram: input.pictogram, label: json(input.label), value: json(input.value), recurrence: json(input.recurrence) };
  if (input.id) await db.chore.update({ where: { id: input.id }, data });
  else await db.chore.create({ data });
}

export async function deleteChore(db: Tx, input: In<"byId">) {
  await db.chore.deleteMany({ where: { id: input.id } });
}

// ── Meals and dates ─────────────────────────────────────────────────────────
/** An empty dinner clears the day. */
export async function saveMeal(db: Tx, input: In<"meal">) {
  if (!input.dinner) {
    await db.meal.deleteMany({ where: { day: input.day } });
    return;
  }
  const data = { dinner: json(input.dinner), cookId: input.cookId ?? null, note: input.note ? json(input.note) : Prisma.DbNull };
  await db.meal.upsert({ where: { day: input.day }, create: { day: input.day, ...data }, update: data });
}

export async function saveImportantDate(db: Tx, input: In<"importantDate">) {
  const data = { kind: input.kind, title: json(input.title), date: input.date, yearly: input.yearly, memberId: input.memberId ?? null };
  if (input.id) await db.importantDate.update({ where: { id: input.id }, data });
  else await db.importantDate.create({ data });
}

export async function deleteImportantDate(db: Tx, input: In<"byId">) {
  await db.importantDate.deleteMany({ where: { id: input.id } });
}

// ── Calendar (Kindo's own events) ───────────────────────────────────────────
export async function saveEvent(db: Tx, input: In<"event">) {
  const source = await db.calendarSource.findUnique({ where: { id: input.sourceId } });
  if (!source) throw notFound("calendar");
  if (source.readOnly) throw new UserError("readOnly");
  const data = toStoredEvent({ ...input, location: input.location || undefined });
  if (input.id) {
    const existing = await db.event.findUnique({ where: { id: input.id }, include: { source: true } });
    if (!existing) throw notFound("event");
    if (existing.source.readOnly) throw new UserError("readOnly");
    await db.event.update({ where: { id: input.id }, data });
    return input.id;
  }
  return (await db.event.create({ data })).id;
}

export async function deleteEvent(db: Tx, input: In<"byId">) {
  const existing = await db.event.findUnique({ where: { id: input.id }, include: { source: true } });
  if (!existing) return;
  if (existing.source.readOnly) throw new UserError("readOnly");
  await db.event.delete({ where: { id: input.id } });
}
