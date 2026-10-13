import { beforeEach, describe, expect, it } from "vitest";
import { addDays, dateKey, startOfDay } from "@/lib/dates";
import { load, reset, snapshot } from "./browser";
import * as A from "../actions/household";

// No localStorage in Node: the demo household lives in memory, as in a private window.
const today = dateKey(startOfDay(new Date()));
beforeEach(() => reset());

describe("the static demo's household", () => {
  it("starts as the Müller family with today's progress and two extras waiting", () => {
    const s = snapshot();
    expect(s.members.map((m) => m.id)).toEqual(["anna", "max", "lena", "paul"]);
    expect(s.viewer).toMatchObject({ memberId: "anna", isAdmin: true });
    expect(s.approvals.map((a) => a.item.id).sort()).toEqual(["x-car", "x-garden"]);
    expect(s.completions.filter((c) => c.status === "done")).toHaveLength(5);
  });

  it("pays an approved extra and spends points on a reward", async () => {
    const car = snapshot().approvals.find((a) => a.item.id === "x-car")!;
    expect(await A.resolveApproval({ id: car.id, ok: true })).toEqual({ ok: true, data: undefined });
    expect(snapshot().balances.lena).toBe(155);
    expect((await A.redeem({ memberId: "lena", rewardId: "r5" })).ok).toBe(true);
    expect(snapshot().balances.lena).toBe(5);
    expect(await A.redeem({ memberId: "lena", rewardId: "r1" })).toEqual({ ok: false, error: "notEnoughPoints" });
  });

  it("earns routine points at once while they are on, and takes them back when unticked", async () => {
    await A.setRoutineRewards({ memberId: "paul", on: true, points: 5 });
    await A.setCompletion({ itemId: "paul-evening-1", memberId: "paul", day: today, done: true });
    expect(snapshot().balances.paul).toBe(69);
    await A.setCompletion({ itemId: "paul-evening-1", memberId: "paul", day: today, done: false });
    expect(snapshot().balances.paul).toBe(64);
  });

  it("refuses what the server refuses", async () => {
    const old = dateKey(addDays(startOfDay(new Date()), -30));
    expect(await A.setCompletion({ itemId: "paul-evening-1", day: old, done: true })).toEqual({ ok: false, error: "invalid" });
    const school = snapshot().events.find((e) => e.sourceId === "ics-school")!;
    expect(await A.deleteEvent({ id: school.id })).toEqual({ ok: false, error: "readOnly" });
    expect(await A.deleteMember({ id: "anna" })).toEqual({ ok: false, error: "invalid" });
    expect(await A.saveMember({ name: "Oma", role: "adult", color: "#123456", avatar: { kind: "initial" }, email: "oma@example.com" })).toEqual({ ok: false, error: "demo" });
  });

  it("moves a routine step to the routine of its new period", async () => {
    const r = await A.saveRoutineStep({ stepId: "paul-morning-4", memberId: "paul", period: "evening", recurrence: { kind: "daily" }, pictogram: "shoes", label: "Shoes off" });
    expect(r).toEqual({ ok: true, data: { routineId: "paul-evening", stepId: "paul-morning-4" } });
    expect(load().routines.find((x) => x.id === "paul-morning")!.items).toHaveLength(3);
  });

  it("keeps all-day events as the server stores them, at UTC midnight", async () => {
    const day = startOfDay(addDays(new Date(), 3));
    const r = await A.saveEvent({ sourceId: "local", title: "Trip", start: day, end: day, allDay: true, memberIds: [] });
    const e = snapshot().events.find((x) => r.ok && x.id === r.data)!;
    expect(e.start.toISOString()).toBe(`${dateKey(day)}T00:00:00.000Z`);
  });
});
