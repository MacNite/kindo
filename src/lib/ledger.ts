import type { TaskValue } from "./types";

/**
 * The reward rule (§9), shared by the server and the device's optimistic
 * update. Expected routines and chores earn nothing. Extras earn their points,
 * either straight away or once a parent approves. Points need someone to go
 * to, so an "anyone" extra ticked without a name earns nothing.
 */
export function completionOutcome(value: TaskValue, hasMember: boolean): { status: "done" | "pending"; points: number } {
  if (value.kind !== "extra") return { status: "done", points: 0 };
  if (value.needsApproval && hasMember) return { status: "pending", points: 0 };
  return { status: "done", points: hasMember ? value.points : 0 };
}

export const doneKey = (itemId: string, day: string) => `${itemId}@${day}`;
