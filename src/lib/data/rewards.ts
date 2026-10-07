import type { ApprovalRequest, Reward } from "../types";
import { at, dateKey } from "../dates";
import { TODAY } from "./anchor";
import { CHORES } from "./routines";

export const BALANCES: Record<string, number> = { lena: 125, paul: 64 };

export const REWARDS: Reward[] = [
  { id: "r1", emoji: "🍿", title: { en: "Movie night", de: "Filmabend" }, cost: 40 },
  { id: "r2", emoji: "🍦", title: { en: "Ice cream trip", de: "Eis essen gehen" }, cost: 50 },
  { id: "r3", emoji: "🍕", title: { en: "Choose dinner", de: "Abendessen aussuchen" }, cost: 60 },
  { id: "r4", emoji: "🎮", title: { en: "Extra game time", de: "Extra Spielzeit" }, cost: 80 },
  { id: "r5", emoji: "⛺", title: { en: "Sleepover", de: "Übernachtungsparty" }, cost: 150 },
];

const chore = (id: string) => CHORES.find((c) => c.id === id)!.item;
export const APPROVALS: ApprovalRequest[] = [
  { id: "a1", memberId: "lena", item: chore("x-car"), day: dateKey(TODAY), at: at(TODAY, 10, 12) },
  { id: "a2", memberId: "paul", item: chore("x-garden"), day: dateKey(TODAY), at: at(TODAY, 11, 40) },
];

/** Pocket-money mode: what one point is worth. */
export const POINT_VALUE_EUR = 0.05;
