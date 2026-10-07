import type { Member } from "../types";
import { addDays } from "../dates";
import { TODAY } from "./anchor";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export const MEMBERS: Member[] = [
  { id: "anna", name: "Anna", role: "admin", color: "#3B78C2", avatar: { kind: "emoji", value: "🦊" }, birthday: "1988-03-14", account: { email: "anna@mueller.home", lastSeen: "today" } },
  { id: "max", name: "Max", role: "adult", color: "#2E8B6E", avatar: { kind: "emoji", value: "🐻" }, birthday: "1986-11-02", account: { email: "max@mueller.home", lastSeen: "yesterday" } },
  // Lena turns 8 in 12 days – her birthday is derived from today for the demo.
  { id: "lena", name: "Lena", role: "child", color: "#8A5CD1", avatar: { kind: "emoji", value: "🦄" }, birthday: iso(new Date(addDays(TODAY, 12).setFullYear(TODAY.getFullYear() - 7))) },
  { id: "paul", name: "Paul", role: "child", color: "#E39A1B", avatar: { kind: "emoji", value: "🦖" }, birthday: "2022-05-21" },
];

export const FAMILY_NAME = "Müller";
