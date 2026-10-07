import type { Meal } from "../types";
import { addDays, startOfWeek } from "../dates";
import { TODAY } from "./anchor";

const mon = startOfWeek(TODAY, 1);
const m = (d: number, en: string, de: string, cookId?: string, note?: Meal["note"]): Meal => ({ date: addDays(mon, d), dinner: { en, de }, cookId, note });

export const MEALS: Meal[] = [
  m(0, "Pasta with tomato sauce", "Nudeln mit Tomatensoße", "max"),
  m(1, "Tacos", "Tacos", "anna", { en: "Lena makes the guacamole", de: "Lena macht Guacamole" }),
  m(2, "Chickpea curry", "Kichererbsen-Curry", "anna"),
  m(3, "Leftovers", "Reste", undefined),
  m(4, "Pizza night", "Pizzaabend", "max", { en: "Everyone tops their own", de: "Jeder belegt selbst" }),
  m(5, "Pancakes", "Pfannkuchen", "max"),
  m(6, "Roast chicken & potatoes", "Brathähnchen mit Kartoffeln", "anna"),
];
