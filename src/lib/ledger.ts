import type { HouseholdData, Member, RewardMode, TaskValue } from "./types";

/**
 * The reward rule (§9), shared by the server and the device's optimistic
 * update. Items without a reward only count as done. Items with one earn
 * their points, either straight away or once a parent approves. Points need
 * someone to go to, so an "anyone" chore ticked without a name earns nothing.
 */
export function completionOutcome(value: TaskValue, hasMember: boolean): { status: "done" | "pending"; points: number } {
  if (value.kind !== "extra") return { status: "done", points: 0 };
  if (value.needsApproval && hasMember) return { status: "pending", points: 0 };
  return { status: "done", points: hasMember ? value.points : 0 };
}

/** What a member's routine steps earn when nothing else is set. */
export const DEFAULT_ROUTINE_POINTS = 5;

/**
 * What a routine step earns now (§9, D42). Routines earn nothing unless the
 * household uses rewards and the child's routine rewards are on. Then a step
 * earns its own points, or the child's routine points when it has none of its
 * own, at once: nobody approves brushing teeth every day.
 */
export function routineStepValue(own: TaskValue, rewards: Member["routineRewards"], mode: RewardMode): TaskValue {
  if (mode === "off" || !rewards?.on) return { kind: "expected" };
  const points = own.kind === "extra" ? own.points : rewards.points;
  return points > 0 ? { kind: "extra", points, needsApproval: false } : { kind: "expected" };
}

/** The snapshot with every routine step's value worked out again, after the reward settings changed. */
export function resolveRoutineValues(d: HouseholdData): HouseholdData {
  const rewards = new Map(d.members.map((m) => [m.id, m.routineRewards]));
  return {
    ...d,
    routines: d.routines.map((r) => ({
      ...r,
      items: r.items.map((i) => ({ ...i, value: routineStepValue(i.own ?? { kind: "expected" }, rewards.get(r.memberId), d.household.rewardMode) })),
    })),
  };
}

export const doneKey = (itemId: string, day: string) => `${itemId}@${day}`;
