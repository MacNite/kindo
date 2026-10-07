import type { ShoppingCategory } from "./types";

/** Naive keyword categoriser so quick-add lands somewhere sensible, in German or English. */
export function guessCategory(name: string, listId?: string): ShoppingCategory {
  if (listId === "hardware") return "hardware";
  if (listId === "drugstore") return "care";
  const n = name.toLowerCase();
  if (/milch|milk|käse|cheese|joghurt|yog|butter|sahne|cream|quark/.test(n)) return "dairy";
  if (/apfel|äpfel|apple|banan|tomat|salat|lettuce|karotte|carrot|gurke|zwiebel|onion|obst|fruit|kartoffel|potato/.test(n)) return "produce";
  if (/brot|bread|brötchen|roll|brez|pretzel/.test(n)) return "bakery";
  if (/\btk\b|tk-|frozen|tiefkühl|eis\b|ice cream/.test(n)) return "frozen";
  if (/shampoo|zahnpasta|toothpaste|pflaster|plaster|creme|seife|soap/.test(n)) return "care";
  if (/tabs|spülmittel|washing|waschmittel|müllbeutel|bin bag|klopapier|toilet/.test(n)) return "household";
  if (/nudel|pasta|reis|rice|mehl|flour|zucker|sugar|kaffee|coffee|tee\b|tea\b|öl\b|oil\b|dose|tin\b/.test(n)) return "pantry";
  return "other";
}
