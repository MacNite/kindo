import type { ShoppingItem, ShoppingList } from "../types";

export const LISTS: ShoppingList[] = [
  { id: "groceries", name: { en: "Groceries", de: "Lebensmittel" }, icon: "🥕" },
  { id: "hardware", name: { en: "Hardware store", de: "Baumarkt" }, icon: "🔩" },
  { id: "drugstore", name: { en: "Drugstore", de: "Drogerie" }, icon: "🧴" },
];

let n = 0;
const i = (listId: string, category: ShoppingItem["category"], en: string, de: string, qty?: string, memberId?: string, done = false): ShoppingItem =>
  ({ id: `s${n++}`, listId, category, name: { en, de }, qty, memberId, done });

export const ITEMS: ShoppingItem[] = [
  i("groceries", "produce", "Apples", "Äpfel", "1 kg"),
  i("groceries", "produce", "Bananas", "Bananen", undefined, "lena"),
  i("groceries", "produce", "Cherry tomatoes", "Cherrytomaten"),
  i("groceries", "produce", "Limes", "Limetten", "3"),
  i("groceries", "dairy", "Milk", "Milch", "2 l"),
  i("groceries", "dairy", "Butter", "Butter"),
  i("groceries", "dairy", "Natural yoghurt", "Naturjoghurt", "500 g"),
  i("groceries", "dairy", "Grated cheese", "Reibekäse", undefined, undefined, true),
  i("groceries", "bakery", "Wholegrain bread", "Vollkornbrot"),
  i("groceries", "bakery", "Pretzels for Saturday", "Brezeln für Samstag", "6", "max"),
  i("groceries", "pantry", "Tortilla wraps", "Tortillas", "8"),
  i("groceries", "pantry", "Coconut milk", "Kokosmilch", "2"),
  i("groceries", "pantry", "Coffee beans", "Kaffeebohnen", undefined, "anna"),
  i("groceries", "pantry", "Pasta", "Nudeln", undefined, undefined, true),
  i("groceries", "frozen", "Frozen peas", "TK-Erbsen"),
  i("groceries", "household", "Dishwasher tabs", "Spülmaschinentabs"),
  i("hardware", "hardware", "Picture hooks", "Bilderhaken"),
  i("hardware", "hardware", "AA batteries", "AA-Batterien", "8", "max"),
  i("hardware", "hardware", "E27 bulb, warm white", "E27-Lampe warmweiß", "2"),
  i("hardware", "hardware", "Wood glue", "Holzleim"),
  i("drugstore", "care", "Kids' toothpaste", "Kinderzahnpasta", "2", "paul"),
  i("drugstore", "care", "Plasters", "Pflaster"),
  i("drugstore", "care", "Shampoo", "Shampoo"),
  i("drugstore", "care", "Hand cream", "Handcreme", undefined, "anna", true),
];
