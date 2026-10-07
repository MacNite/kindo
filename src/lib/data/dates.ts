import type { ImportantDate } from "../types";
import { addDays } from "../dates";
import { TODAY } from "./anchor";

export const IMPORTANT_DATES: ImportantDate[] = [
  { id: "d1", kind: "birthday", title: "Oma Ingrid", date: addDays(TODAY, 4), turns: 70 },
  { id: "d2", kind: "school", title: { en: "Zoo trip", de: "Zoo-Ausflug" }, date: addDays(TODAY, 9), memberId: "lena" },
  { id: "d3", kind: "birthday", title: "Lena", date: addDays(TODAY, 12), memberId: "lena", turns: 8 },
  { id: "d4", kind: "anniversary", title: { en: "Anna & Max", de: "Anna & Max" }, date: addDays(TODAY, 27), turns: 10 },
  { id: "d5", kind: "birthday", title: "Opa Klaus", date: addDays(TODAY, 41), turns: 73 },
  { id: "d6", kind: "other", title: { en: "Christmas market", de: "Weihnachtsmarkt" }, date: addDays(TODAY, 52) },
];
