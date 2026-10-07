import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import * as H from "@/server/household";
import { loadSnapshot } from "@/server/snapshot";
import { seedDemo } from "@/server/demo/seed";
import { setupHousehold } from "@/server/setup";
import { dateKey } from "@/lib/dates";
import { TEST_DB, VIEWER, resetTestDatabase } from "./db";

const day = dateKey(new Date());

describe.skipIf(!TEST_DB)("household persistence (§19.2)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = await resetTestDatabase();
  }, 60_000);
  afterAll(() => db?.$disconnect());

  beforeEach(async () => {
    await db.household.deleteMany();
    await db.member.deleteMany();
    await db.shoppingList.deleteMany();
    await db.calendarSource.deleteMany();
    await db.reward.deleteMany();
    await db.completion.deleteMany();
    await db.chore.deleteMany();
    await db.importantDate.deleteMany();
    await db.meal.deleteMany();
    await db.task.deleteMany();
    await db.photoAlbum.deleteMany();
    await db.$transaction((tx) => seedDemo(tx), { timeout: 60_000 });
  });

  it("loads the demo family into one snapshot, without any server-only fields", async () => {
    const s = await loadSnapshot(db, VIEWER);
    expect(s?.members.map((m) => m.name)).toEqual(["Anna", "Max", "Lena", "Paul"]);
    expect(s?.balances).toMatchObject({ lena: 125, paul: 64 });
    expect(s?.approvals).toHaveLength(2);
    expect(s?.events.length).toBeGreaterThan(50);
  });

  it("expected routine steps are only marked done and earn nothing", async () => {
    await H.setCompletion(db, { itemId: "paul-morning-3", day, done: true });
    expect(await db.completion.findUnique({ where: { itemId_day: { itemId: "paul-morning-3", day } } })).toMatchObject({ status: "done", memberId: "paul" });
    expect(await H.balanceOf(db, "paul")).toBe(64);
  });

  it("ticking twice is harmless and unticking removes the completion", async () => {
    await H.setCompletion(db, { itemId: "c-table", day, done: true });
    await H.setCompletion(db, { itemId: "c-table", day, done: true });
    expect(await db.completion.count({ where: { itemId: "c-table", day } })).toBe(1);
    await H.setCompletion(db, { itemId: "c-table", day, done: false });
    expect(await db.completion.count({ where: { itemId: "c-table", day } })).toBe(0);
  });

  it("an extra that needs approval earns its points only once a parent says yes", async () => {
    await H.setCompletion(db, { itemId: "x-garage", day, done: true });
    const c = await db.completion.findUniqueOrThrow({ where: { itemId_day: { itemId: "x-garage", day } } });
    expect(c.status).toBe("pending");
    expect(await H.balanceOf(db, "lena")).toBe(125);
    await H.resolveApproval(db, { id: c.id, ok: true });
    await H.resolveApproval(db, { id: c.id, ok: true }); // a second screen answering too
    expect(await H.balanceOf(db, "lena")).toBe(175);
    // Unticking afterwards takes the points back.
    await H.setCompletion(db, { itemId: "x-garage", day, done: false });
    expect(await H.balanceOf(db, "lena")).toBe(125);
  });

  it("declining an extra unticks it and awards nothing", async () => {
    const pending = await db.completion.findFirstOrThrow({ where: { itemId: "x-car", status: "pending" } });
    await H.resolveApproval(db, { id: pending.id, ok: false });
    expect(await db.completion.count({ where: { id: pending.id } })).toBe(0);
    expect(await H.balanceOf(db, "lena")).toBe(125);
  });

  it("an extra without approval pays out at once", async () => {
    await db.chore.update({ where: { id: "x-leaves" }, data: { value: { kind: "extra", points: 25, needsApproval: false }, memberId: "paul" } });
    await H.setCompletion(db, { itemId: "x-leaves", day, done: true });
    expect(await H.balanceOf(db, "paul")).toBe(89);
  });

  it("redeeming spends points and refuses when there are not enough", async () => {
    await H.redeem(db, { memberId: "paul", rewardId: "r2" });
    expect(await H.balanceOf(db, "paul")).toBe(14);
    await expect(H.redeem(db, { memberId: "paul", rewardId: "r2" })).rejects.toMatchObject({ code: "notEnoughPoints" });
  });

  it("two screens redeeming at the same moment can't spend the same points twice", async () => {
    const results = await Promise.allSettled([
      db.$transaction((tx) => H.redeem(tx, { memberId: "paul", rewardId: "r1" })),
      db.$transaction((tx) => H.redeem(tx, { memberId: "paul", rewardId: "r1" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await H.balanceOf(db, "paul")).toBe(24);
  });

  it("a replayed offline shopping add creates the item once", async () => {
    const add = { id: "offline-1", listId: "groceries", name: "Oat milk" };
    await H.addShoppingItem(db, add);
    await H.addShoppingItem(db, add);
    expect(await db.shoppingItem.findUniqueOrThrow({ where: { id: "offline-1" } })).toMatchObject({ category: "dairy" });
    expect(await db.shoppingItem.count({ where: { id: "offline-1" } })).toBe(1);
  });

  it("a new routine is created with its first step, and goes when its last step does", async () => {
    const { routineId, stepId } = await H.saveRoutineStep(db, {
      memberId: "max", period: "evening", recurrence: { kind: "daily" }, pictogram: "book", label: "Read",
    });
    expect(await db.routine.findUniqueOrThrow({ where: { id: routineId } })).toMatchObject({ memberId: "max", period: "evening" });
    await H.deleteRoutineStep(db, { id: stepId });
    expect(await db.routine.count({ where: { id: routineId } })).toBe(0);
  });

  it("routine steps never earn points, whatever the device sends", async () => {
    const { stepId } = await H.saveRoutineStep(db, {
      routineId: "lena-evening", memberId: "lena", period: "evening", recurrence: { kind: "daily" }, pictogram: "book", label: "Read",
      ...({ value: { kind: "extra", points: 99, needsApproval: false } } as object),
    });
    expect((await db.routineStep.findUniqueOrThrow({ where: { id: stepId } })).value).toEqual({ kind: "expected" });
  });

  it("the last admin can be neither deleted nor demoted", async () => {
    await H.saveMember(db, { id: "max", name: "Max", role: "adult", color: "#2E8B6E", avatar: { kind: "initial" } });
    await expect(H.deleteMember(db, { id: "anna" })).rejects.toMatchObject({ code: "invalid" });
    await expect(H.saveMember(db, { id: "anna", name: "Anna", role: "adult", color: "#3B78C2", avatar: { kind: "initial" } })).rejects.toMatchObject({ code: "invalid" });
  });

  it("events go only into writable calendars, all-day events as dates", async () => {
    await expect(H.saveEvent(db, { sourceId: "ics-school", title: "x", start: new Date(), end: new Date(), allDay: false, memberIds: [] })).rejects.toMatchObject({ code: "readOnly" });
    const id = await H.saveEvent(db, { sourceId: "local", title: "Day off", start: new Date(2026, 9, 7), end: new Date(2026, 9, 7), allDay: true, memberIds: ["max"] });
    const e = await db.event.findUniqueOrThrow({ where: { id } });
    expect(e.start.toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(e.end.toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });

  it("an empty dinner clears the day", async () => {
    await H.saveMeal(db, { day: "2030-01-01", dinner: "Soup", cookId: "max" });
    await H.saveMeal(db, { day: "2030-01-01", dinner: "" });
    expect(await db.meal.count({ where: { day: "2030-01-01" } })).toBe(0);
  });
});

describe.skipIf(!TEST_DB)("first-run setup", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = await resetTestDatabase();
  }, 60_000);
  afterAll(() => db?.$disconnect());

  it("creates the household and its first admin with a login, once", async () => {
    const input = {
      demo: false, household: "Schmidts", timezone: "Europe/Vienna", member: { name: "Eva", color: "#3B78C2", avatar: { kind: "initial" as const } },
      email: "eva@example.test", password: "correct horse battery",
    };
    const { memberId } = await setupHousehold(db, input);
    const eva = await db.member.findUniqueOrThrow({ where: { id: memberId }, include: { user: true } });
    expect(eva).toMatchObject({ role: "admin", name: "Eva", user: { email: "eva@example.test" } });
    expect(await db.shoppingList.count()).toBe(1);
    expect(await db.calendarSource.findUnique({ where: { id: "local" } })).not.toBeNull();
    await expect(setupHousehold(db, input)).rejects.toMatchObject({ code: "conflict" });
  });
});
