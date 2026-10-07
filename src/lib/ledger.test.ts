import { describe, expect, it } from "vitest";
import { resolveApproval, toggleItem, type Ledger } from "./ledger";
import type { TaskItem } from "./types";

const day = new Date(2026, 9, 7);
const item = (id: string, value: TaskItem["value"]): TaskItem => ({ id, pictogram: "car", label: id, value });
const car = item("car", { kind: "extra", points: 20, needsApproval: true });
const dishes = item("dishes", { kind: "extra", points: 5, needsApproval: false });
const teeth = item("teeth", { kind: "expected" });
const empty = (): Ledger => ({ done: new Set(), approvals: [], balances: { lena: 125 }, awarded: {} });

describe("ledger", () => {
  it("expected items never earn points", () => {
    const l = toggleItem(empty(), "lena", teeth, day);
    expect(l.done.has("teeth@2026-10-07")).toBe(true);
    expect(l.balances.lena).toBe(125);
  });

  it("direct extras award and take back their points", () => {
    let l = toggleItem(empty(), "lena", dishes, day);
    expect(l.balances.lena).toBe(130);
    l = toggleItem(l, "lena", dishes, day);
    expect(l.balances.lena).toBe(125);
  });

  it("approved extras pay once and are reversed when unticked", () => {
    let l = toggleItem(empty(), "lena", car, day);
    expect(l.balances.lena).toBe(125);
    l = resolveApproval(l, l.approvals[0].id, true);
    expect(l.balances.lena).toBe(145);
    // Untick: points go back, no new request appears.
    l = toggleItem(l, "lena", car, day);
    expect(l.balances.lena).toBe(125);
    expect(l.approvals).toHaveLength(0);
    // Tick again: a fresh request, approved once more → still only one award.
    l = toggleItem(l, "lena", car, day);
    l = resolveApproval(l, l.approvals[0].id, true);
    expect(l.balances.lena).toBe(145);
  });

  it("unticking withdraws a pending request", () => {
    let l = toggleItem(empty(), "lena", car, day);
    l = toggleItem(l, "lena", car, day);
    expect(l.approvals).toHaveLength(0);
    expect(l.done.size).toBe(0);
  });

  it("declining unticks the item for the day it was ticked", () => {
    let l = toggleItem(empty(), "lena", car, day);
    l = resolveApproval(l, l.approvals[0].id, false);
    expect(l.done.size).toBe(0);
    expect(l.balances.lena).toBe(125);
  });
});
