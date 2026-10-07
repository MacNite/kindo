import type { ApprovalRequest, TaskItem } from "./types";
import { dateKey } from "./dates";

/**
 * Completion and points bookkeeping (§9). Pure, so the store stays thin and
 * the rules are testable. Expected items only toggle `done`; extras earn
 * points, either directly or once a parent approves. Every award is recorded
 * in `awarded` so unticking an item takes back exactly what it earned.
 */
export interface Ledger {
  /** `${itemId}@${YYYY-MM-DD}` */
  done: Set<string>;
  approvals: ApprovalRequest[];
  balances: Record<string, number>;
  awarded: Record<string, { memberId: string; points: number }>;
}

export const doneKey = (itemId: string, day: string) => `${itemId}@${day}`;

export function toggleItem(l: Ledger, memberId: string, item: TaskItem, date: Date, now = new Date()): Ledger {
  const day = dateKey(date);
  const key = doneKey(item.id, day);
  const done = new Set(l.done);
  const checking = !done.has(key);
  if (checking) done.add(key); else done.delete(key);
  const next = { ...l, done };
  if (item.value.kind !== "extra") return next;

  if (checking) {
    if (item.value.needsApproval) {
      if (l.approvals.some((r) => doneKey(r.item.id, r.day) === key)) return next;
      return { ...next, approvals: [...l.approvals, { id: `a-${key}`, memberId, item, day, at: now }] };
    }
    return award(next, key, memberId, item.value.points);
  }
  // Unticking: withdraw a pending request and take back anything already earned.
  return revoke({ ...next, approvals: l.approvals.filter((r) => doneKey(r.item.id, r.day) !== key) }, key);
}

export function resolveApproval(l: Ledger, id: string, ok: boolean): Ledger {
  const req = l.approvals.find((a) => a.id === id);
  if (!req) return l;
  const key = doneKey(req.item.id, req.day);
  const next = { ...l, approvals: l.approvals.filter((r) => r.id !== id) };
  if (ok) return req.item.value.kind === "extra" ? award(next, key, req.memberId, req.item.value.points) : next;
  const done = new Set(l.done);
  done.delete(key);
  return { ...next, done };
}

function award(l: Ledger, key: string, memberId: string, points: number): Ledger {
  if (l.awarded[key]) return l;
  return {
    ...l,
    balances: { ...l.balances, [memberId]: (l.balances[memberId] ?? 0) + points },
    awarded: { ...l.awarded, [key]: { memberId, points } },
  };
}

function revoke(l: Ledger, key: string): Ledger {
  const a = l.awarded[key];
  if (!a) return l;
  const { [key]: _, ...awarded } = l.awarded;
  return { ...l, balances: { ...l.balances, [a.memberId]: (l.balances[a.memberId] ?? 0) - a.points }, awarded };
}
