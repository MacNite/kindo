import type { ShoppingCategory, Text } from "./types";

const names = (t?: Text) => (t === undefined ? "" : typeof t === "string" ? t : `${t.de} ${t.en}`).toLowerCase();

/** A list named for a kind of shop: everything on it belongs there, whatever it's called. */
function listCategory(listName?: Text): ShoppingCategory | null {
  const n = names(listName);
  if (/baumarkt|hardware|\bdiy\b|heimwerk/.test(n)) return "hardware";
  if (/drogerie|drugstore|pharmacy|apotheke|chemist/.test(n)) return "care";
  return null;
}

/**
 * Naive keyword categoriser so quick-add lands somewhere sensible, in German
 * or English. A list named for a hardware store or drugstore decides on its own.
 */
export function guessCategory(name: string, listName?: Text): ShoppingCategory {
  const byList = listCategory(listName);
  if (byList) return byList;
  const n = name.toLowerCase();
  // Frozen first: "ice cream" is not a dairy item.
  if (/\btk\b|tk-|frozen|tiefkühl|\beis(\b|creme)|ice cream/.test(n)) return "frozen";
  if (/milch|milk|käse|cheese|joghurt|yog|butter|sahne|cream|quark/.test(n)) return "dairy";
  if (/apfel|äpfel|apple|banan|tomat|salat|lettuce|karotte|carrot|gurke|zwiebel|onion|obst|fruit|kartoffel|potato/.test(n)) return "produce";
  if (/brot|bread|brötchen|\broll|brez|pretzel/.test(n)) return "bakery";
  if (/shampoo|zahnpasta|toothpaste|pflaster|plaster|creme|seife|soap/.test(n)) return "care";
  if (/tabs|spülmittel|washing|waschmittel|müllbeutel|bin bag|klopapier|toilet/.test(n)) return "household";
  if (/schraube|screw|dübel|batterie|batter(y|ies)|glühbirne|bulb|leim|glue|bohrer|drill/.test(n)) return "hardware";
  if (/nudel|pasta|reis|rice|mehl|flour|zucker|sugar|kaffee|coffee|tee\b|tea\b|öl\b|oil\b|dose|tin\b/.test(n)) return "pantry";
  return "other";
}
