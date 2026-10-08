import type {
  CalendarEvent, CalendarSource, Chore, ImportantDate, Meal, Member, OneOffTask, PhotoAlbum, Reward, Routine,
  ShoppingItem, ShoppingList, TaskItem, Weather, WidgetConfig,
} from "@/lib/types";
import { addDays, at, dateKey, startOfWeek } from "@/lib/dates";

/**
 * The Müller family: the demo household (§20 D11). Everything is built
 * relative to `today`, so a freshly seeded demo always looks current.
 * Only the seed (`seed.ts`) and demo weather read this; the UI never does.
 */
export const FAMILY_NAME = "Müllers";

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "agenda", enabled: true, size: "m" },
  { id: "weather", enabled: true, size: "s" },
  { id: "meals", enabled: true, size: "s" },
  { id: "chores", enabled: true, size: "m" },
  { id: "dates", enabled: true, size: "m" },
  { id: "shopping", enabled: true, size: "s" },
  { id: "photos", enabled: true, size: "s" },
  { id: "upcoming", enabled: true, size: "m" },
  { id: "clock", enabled: false, size: "s" },
  { id: "routines", enabled: false, size: "m" },
];

export function demoMembers(today: Date): Member[] {
  const in12 = addDays(today, 12);
  const lenaBirthday = new Date(in12.setFullYear(in12.getFullYear() - 8));
  return [
    { id: "anna", name: "Anna", role: "admin", color: "#3B78C2", avatar: { kind: "emoji", value: "🦊" }, birthday: "1988-03-14" },
    { id: "max", name: "Max", role: "adult", color: "#2E8B6E", avatar: { kind: "emoji", value: "🐻" }, birthday: "1986-11-02" },
    // Lena turns 8 in 12 days: her birthday is derived from today for the demo.
    { id: "lena", name: "Lena", role: "child", color: "#8A5CD1", avatar: { kind: "emoji", value: "🦄" }, birthday: dateKey(lenaBirthday) },
    { id: "paul", name: "Paul", role: "child", color: "#E39A1B", avatar: { kind: "emoji", value: "🦖" }, birthday: "2022-05-21" },
  ];
}

const step = (id: string, pictogram: string, en: string, de: string, value: TaskItem["value"] = { kind: "expected" }): TaskItem =>
  ({ id, pictogram, label: { en, de }, value });

export function demoRoutines(): Routine[] {
  const r = (id: string, memberId: string, period: Routine["period"], recurrence: Routine["recurrence"], steps: [string, string, string][]): Routine =>
    ({ id, memberId, period, recurrence, items: steps.map(([p, en, de], i) => step(`${id}-${i + 1}`, p, en, de)) });
  return [
    r("lena-morning", "lena", "morning", { kind: "schoolDays" }, [
      ["bed", "Make bed", "Bett machen"], ["toothbrush", "Brush teeth", "Zähne putzen"],
      ["clothes", "Get dressed", "Anziehen"], ["backpack", "Pack school bag", "Schulranzen packen"],
    ]),
    r("lena-afternoon", "lena", "afternoon", { kind: "schoolDays" }, [
      ["homework", "Homework", "Hausaufgaben"], ["lunchbox", "Empty lunch box", "Brotdose ausräumen"], ["music", "Piano practice", "Klavier üben"],
    ]),
    r("lena-evening", "lena", "evening", { kind: "daily" }, [
      ["toys", "Tidy room", "Zimmer aufräumen"], ["pyjamas", "Pyjamas", "Schlafanzug"],
      ["toothbrush", "Brush teeth", "Zähne putzen"], ["book", "Reading time", "Lesezeit"],
    ]),
    r("paul-morning", "paul", "morning", { kind: "daily" }, [
      ["toothbrush", "Brush teeth", "Zähne putzen"], ["clothes", "Get dressed", "Anziehen"],
      ["breakfast", "Breakfast", "Frühstück"], ["shoes", "Shoes on", "Schuhe an"],
    ]),
    r("paul-afternoon", "paul", "afternoon", { kind: "daily" }, [
      ["toys", "Tidy toys", "Spielzeug aufräumen"], ["sun", "Play outside", "Draußen spielen"],
    ]),
    r("paul-evening", "paul", "evening", { kind: "daily" }, [
      ["bath", "Bath", "Baden"], ["pyjamas", "Pyjamas", "Schlafanzug"], ["toothbrush", "Brush teeth", "Zähne putzen"],
      ["book", "Story", "Geschichte"], ["sleep", "Lights out", "Licht aus"],
    ]),
  ];
}

export function demoChores(today: Date): Chore[] {
  const c = (id: string, memberId: string | null, pictogram: string, en: string, de: string, recurrence: Chore["recurrence"], value?: TaskItem["value"]): Chore =>
    ({ id, memberId, item: step(id, pictogram, en, de, value), recurrence });
  const extra = (points: number): TaskItem["value"] => ({ kind: "extra", points, needsApproval: true });
  return [
    c("c-bins", "max", "trash", "Take bins out", "Mülltonnen rausstellen", { kind: "weekly", day: 1, interval: 1 }),
    c("c-dish", "lena", "dishes", "Empty dishwasher", "Spülmaschine ausräumen", { kind: "weekdays", days: [1, 3, 5] }),
    c("c-table", "paul", "table", "Set the table", "Tisch decken", { kind: "daily" }),
    c("c-laundry", "anna", "laundry", "Laundry", "Wäsche waschen", { kind: "weekdays", days: [1, 4] }),
    c("c-vacuum", "max", "vacuum", "Vacuum downstairs", "Unten staubsaugen", { kind: "weekly", day: 5, interval: 1 }),
    c("c-bedding", "anna", "bedding", "Change bedding", "Betten beziehen", { kind: "weekly", day: 6, interval: 2 }),
    c("c-plants", "paul", "plants", "Water plants", "Blumen gießen", { kind: "weekdays", days: [3, 6] }),
    c("c-cat", null, "cat", "Feed Mimi", "Mimi füttern", { kind: "daily" }),
    // Extras: optional contributions that earn rewards
    c("x-car", "lena", "car", "Wash the car", "Auto waschen", { kind: "once", date: dateKey(today) }, extra(30)),
    c("x-garden", "paul", "garden", "Help in the garden", "Im Garten helfen", { kind: "weekdays", days: [today.getDay() as 0] }, extra(20)),
    c("x-garage", "lena", "garage", "Tidy the garage", "Garage aufräumen", { kind: "weekly", day: 6, interval: 1 }, extra(50)),
    c("x-leaves", null, "leaves", "Rake leaves", "Laub rechen", { kind: "weekdays", days: [6, 0] }, extra(25)),
  ];
}

export function demoTasks(today: Date): OneOffTask[] {
  return [
    { id: "o1", title: { en: "Sign zoo trip form", de: "Zoo-Ausflug unterschreiben" }, memberId: "anna", due: at(addDays(today, 1), 8), done: false },
    { id: "o2", title: { en: "Order Lena's birthday cake", de: "Geburtstagstorte für Lena bestellen" }, memberId: "anna", due: addDays(today, 5), done: false },
    { id: "o3", title: { en: "Return library books", de: "Bücherei-Bücher zurückbringen" }, memberId: "max", due: addDays(today, -1), done: false },
    { id: "o4", title: { en: "Buy present for Oma", de: "Geschenk für Oma kaufen" }, memberId: "max", due: addDays(today, 2), done: false },
    { id: "o5", title: { en: "Renew Paul's ID card", de: "Kinderausweis Paul verlängern" }, memberId: null, due: addDays(today, 14), done: false },
    { id: "o6", title: { en: "Bleed the radiators", de: "Heizkörper entlüften" }, memberId: "max", done: true },
  ];
}

export const DEMO_BALANCES: Record<string, number> = { lena: 125, paul: 64 };

export const DEMO_REWARDS: Reward[] = [
  { id: "r1", emoji: "🍿", title: { en: "Movie night", de: "Filmabend" }, cost: 40 },
  { id: "r2", emoji: "🍦", title: { en: "Ice cream trip", de: "Eis essen gehen" }, cost: 50 },
  { id: "r3", emoji: "🍕", title: { en: "Choose dinner", de: "Abendessen aussuchen" }, cost: 60 },
  { id: "r4", emoji: "🎮", title: { en: "Extra game time", de: "Extra Spielzeit" }, cost: 80 },
  { id: "r5", emoji: "⛺", title: { en: "Sleepover", de: "Übernachtungsparty" }, cost: 150 },
];

/** Already ticked today: the first steps of the morning routines, and two extras waiting for an OK. */
export const DEMO_DONE_TODAY: Record<string, number> = { "lena-morning": 3, "paul-morning": 2 };
export const DEMO_PENDING = [
  { itemId: "x-car", memberId: "lena", hour: 10, minute: 12 },
  { itemId: "x-garden", memberId: "paul", hour: 11, minute: 40 },
];

export const DEMO_LISTS: ShoppingList[] = [
  { id: "groceries", name: { en: "Groceries", de: "Lebensmittel" }, icon: "🥕" },
  { id: "hardware", name: { en: "Hardware store", de: "Baumarkt" }, icon: "🔩" },
  { id: "drugstore", name: { en: "Drugstore", de: "Drogerie" }, icon: "🧴" },
];

export function demoShopping(): ShoppingItem[] {
  let n = 0;
  const i = (listId: string, category: ShoppingItem["category"], en: string, de: string, qty?: string, memberId?: string, done = false): ShoppingItem =>
    ({ id: `s${n++}`, listId, category, name: { en, de }, qty, memberId, done });
  return [
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
}

export function demoMeals(today: Date): Omit<Meal, "date">[] {
  const mon = startOfWeek(today, 1);
  const m = (d: number, en: string, de: string, cookId?: string, note?: Meal["note"]) => ({ day: dateKey(addDays(mon, d)), dinner: { en, de }, cookId, note });
  return [
    m(0, "Pasta with tomato sauce", "Nudeln mit Tomatensoße", "max"),
    m(1, "Tacos", "Tacos", "anna", { en: "Lena makes the guacamole", de: "Lena macht Guacamole" }),
    m(2, "Chickpea curry", "Kichererbsen-Curry", "anna"),
    m(3, "Leftovers", "Reste", undefined),
    m(4, "Pizza night", "Pizzaabend", "max", { en: "Everyone tops their own", de: "Jeder belegt selbst" }),
    m(5, "Pancakes", "Pfannkuchen", "max"),
    m(6, "Roast chicken & potatoes", "Brathähnchen mit Kartoffeln", "anna"),
  ];
}

export function demoDates(today: Date): ImportantDate[] {
  const yearsAgo = (days: number, years: number) => {
    const d = addDays(today, days);
    d.setFullYear(d.getFullYear() - years);
    return dateKey(d);
  };
  return [
    { id: "d1", kind: "birthday", title: "Oma Ingrid", date: yearsAgo(4, 70), yearly: true },
    { id: "d2", kind: "school", title: { en: "Zoo trip", de: "Zoo-Ausflug" }, date: dateKey(addDays(today, 9)), yearly: false, memberId: "lena" },
    { id: "d3", kind: "birthday", title: "Lena", date: yearsAgo(12, 8), yearly: true, memberId: "lena" },
    { id: "d4", kind: "anniversary", title: { en: "Anna & Max", de: "Anna & Max" }, date: yearsAgo(27, 10), yearly: true },
    { id: "d5", kind: "birthday", title: "Opa Klaus", date: yearsAgo(41, 73), yearly: true },
    { id: "d6", kind: "other", title: { en: "Christmas market", de: "Weihnachtsmarkt" }, date: dateKey(addDays(today, 52)), yearly: false },
  ];
}

/** Birthdays as if from the Müllers' Nextcloud contacts, one renamed for Kindo (D46). */
export function demoContacts(today: Date) {
  const yearsAgo = (days: number, years: number) => {
    const d = addDays(today, days);
    d.setFullYear(d.getFullYear() - years);
    return dateKey(d);
  };
  return [
    { uid: "demo-brigitte", name: "Mama Müller", alias: "Oma Biggy", date: yearsAgo(5, 75), show: true, memberId: "max" },
    { uid: "demo-julia", name: "Julia Hartmann", alias: "Tante Jule", date: yearsAgo(120, 42), show: true, memberId: "anna" },
    { uid: "demo-ben", name: "Ben Schröder", date: yearsAgo(56, 8), show: true, memberId: "lena" },
    { uid: "demo-carla", name: "Carla Rossi", date: `--${dateKey(addDays(today, 200)).slice(5)}`, show: true },
    { uid: "demo-peter", name: "Peter Vogt (Büro)", date: yearsAgo(250, 47), show: false },
  ];
}

export const DEMO_SOURCES: (CalendarSource & { background?: boolean })[] = [
  { id: "nc-family", provider: "caldav", name: { en: "Family", de: "Familie" }, account: "cloud.mueller.home", defaultMemberIds: [], readOnly: false },
  { id: "nc-anna", provider: "caldav", name: "Anna", account: "cloud.mueller.home", defaultMemberIds: ["anna"], readOnly: false },
  { id: "g-max", provider: "google", name: { en: "Max – work", de: "Max – Arbeit" }, account: "max.mueller@gmail.com", defaultMemberIds: ["max"], readOnly: true },
  { id: "ics-school", provider: "ics", name: { en: "Lindenhof Primary", de: "Grundschule Lindenhof" }, account: "schule-lindenhof.de", defaultMemberIds: ["lena"], readOnly: true },
  { id: "ics-waste", provider: "ics", name: { en: "Waste collection", de: "Abfallkalender" }, account: "awb-stadt.de", defaultMemberIds: [], readOnly: true },
  { id: "local", provider: "local", name: { en: "Kindo", de: "Kindo" }, defaultMemberIds: [], readOnly: false },
];

/** About seven weeks of believable family life around today. */
export function demoEvents(today: Date): CalendarEvent[] {
  let n = 0;
  const out: CalendarEvent[] = [];
  const ev = (e: Omit<CalendarEvent, "id">) => out.push({ id: `ev${n++}`, ...e });
  const week0 = startOfWeek(today, 1);
  for (let w = -2; w <= 5; w++) {
    const mon = addDays(week0, w * 7);
    for (let d = 0; d < 5; d++) {
      const day = addDays(mon, d);
      ev({ title: { en: "School", de: "Schule" }, start: at(day, 8), end: at(day, d === 2 ? 11 : 13, 15), memberIds: ["lena"], sourceId: "ics-school", icon: "backpack", background: true });
      ev({ title: "Kita", start: at(day, 8), end: at(day, 12, 30), memberIds: ["paul"], sourceId: "nc-family", icon: "baby", location: "Kita Sonnenblume", background: true });
    }
    const tue = addDays(mon, 1), wed = addDays(mon, 2), thu = addDays(mon, 3), fri = addDays(mon, 4), sat = addDays(mon, 5), sun = addDays(mon, 6);
    ev({ title: { en: "Bins out – general waste", de: "Restmüll" }, start: tue, end: tue, allDay: true, memberIds: [], sourceId: "ics-waste", icon: "trash" });
    if (w % 2 === 0) ev({ title: { en: "Recycling collection", de: "Gelber Sack" }, start: fri, end: fri, allDay: true, memberIds: [], sourceId: "ics-waste", icon: "recycling" });
    ev({ title: { en: "Football practice", de: "Fußballtraining" }, start: at(wed, 16, 30), end: at(wed, 18), memberIds: ["lena", "max"], sourceId: "nc-family", location: "TSV Sportplatz" });
    ev({ title: { en: "Swimming lesson", de: "Schwimmkurs" }, start: at(fri, 15), end: at(fri, 15, 45), memberIds: ["paul", "anna"], sourceId: "nc-family", location: "Hallenbad Nord" });
    ev({ title: "Yoga", start: at(mon, 19, 30), end: at(mon, 20, 45), memberIds: ["anna"], sourceId: "nc-anna" });
    ev({ title: { en: "Team meeting", de: "Teammeeting" }, start: at(mon, 9), end: at(mon, 10), memberIds: ["max"], sourceId: "g-max" });
    ev({ title: { en: "Handball", de: "Handball" }, start: at(thu, 20), end: at(thu, 21, 30), memberIds: ["max"], sourceId: "nc-family" });
    ev({ title: { en: "Piano", de: "Klavier" }, start: at(tue, 15, 30), end: at(tue, 16, 15), memberIds: ["lena"], sourceId: "nc-family", icon: "music" });
    ev({ title: { en: "Farmers' market", de: "Wochenmarkt" }, start: at(sat, 9, 30), end: at(sat, 11), memberIds: [], sourceId: "nc-family" });
    if (w % 2 === 1) ev({ title: { en: "Lunch at Oma's", de: "Mittagessen bei Oma" }, start: at(sun, 12), end: at(sun, 15), memberIds: [], sourceId: "nc-family" });
  }
  const t = today;
  ev({ title: { en: "Dentist – Paul", de: "Zahnarzt – Paul" }, start: at(addDays(t, 1), 10), end: at(addDays(t, 1), 10, 45), memberIds: ["paul", "anna"], sourceId: "nc-anna", location: "Dr. Schreiber" });
  ev({ title: { en: "Parents' evening", de: "Elternabend" }, start: at(addDays(t, 6), 19, 30), end: at(addDays(t, 6), 21), memberIds: ["anna", "max"], sourceId: "ics-school", location: "Grundschule Lindenhof" });
  ev({ title: { en: "Oma Ingrid's birthday", de: "Geburtstag Oma Ingrid" }, start: addDays(t, 4), end: addDays(t, 4), allDay: true, memberIds: [], sourceId: "nc-family" });
  ev({ title: { en: "Lena's birthday", de: "Lenas Geburtstag" }, start: addDays(t, 12), end: addDays(t, 12), allDay: true, memberIds: ["lena"], sourceId: "nc-family" });
  ev({ title: { en: "School trip to the zoo", de: "Ausflug in den Zoo" }, start: at(addDays(t, 9), 8), end: at(addDays(t, 9), 15), memberIds: ["lena"], sourceId: "ics-school" });
  ev({ title: { en: "Call with the landlord", de: "Telefonat Vermieter" }, start: at(t, 17, 30), end: at(t, 18), memberIds: ["max"], sourceId: "local" });
  ev({ title: { en: "Haircut", de: "Friseur" }, start: at(t, 14), end: at(t, 14, 45), memberIds: ["anna"], sourceId: "nc-anna", location: "Salon Kamm" });
  ev({ title: { en: "Playdate with Mia", de: "Spielen bei Mia" }, start: at(addDays(t, 2), 15), end: at(addDays(t, 2), 17), memberIds: ["lena"], sourceId: "nc-family" });
  ev({ title: { en: "Winter tyres", de: "Winterreifen wechseln" }, start: at(addDays(t, 3), 8), end: at(addDays(t, 3), 9), memberIds: ["max"], sourceId: "local", location: "Autohaus Berg" });
  return out;
}

export function demoAlbums(today: Date): PhotoAlbum[] {
  return [
    { id: "al-2026", server: "Family server", name: `Family ${today.getFullYear()}`, count: 412, selected: true, weight: 50 },
    { id: "al-kids", server: "Family server", name: "Kids", count: 1280, selected: true, weight: 30 },
    { id: "al-hol", server: "Family server", name: "Holidays", count: 655, selected: true, weight: 0 },
    { id: "al-house", server: "Family server", name: "House & garden", count: 98, selected: false, weight: 0 },
    { id: "al-shared", server: "Oma & Opa", name: "Shared family", count: 233, selected: true, weight: 20 },
    { id: "al-fav", server: "Oma & Opa", name: "Favourites", count: 61, selected: false, weight: 0 },
  ];
}

const PLACES = ["Baltic Sea, Rügen", "Garden", "Allgäu", "Oma's kitchen", "Lake Constance", "Black Forest", "Home", "Zoo Leipzig", "Amrum"];
export function demoPhotos(today: Date) {
  return Array.from({ length: 18 }, (_, k) => ({
    id: `p${k}`,
    albumId: ["al-2026", "al-kids", "al-hol", "al-shared"][k % 4],
    seed: k * 7 + 3,
    takenAt: addDays(today, -(k * 23 + 5)),
    place: PLACES[k % PLACES.length],
  }));
}

/** Demo weather. There is no weather integration yet, so only the demo shows one. */
export function demoWeather(today: Date): Weather {
  return {
    place: "Freiburg",
    now: 14, sky: "partly", high: 17, low: 8, rainChance: 20,
    days: [
      { date: addDays(today, 1), sky: "rain", high: 13, low: 9 },
      { date: addDays(today, 2), sky: "cloud", high: 12, low: 7 },
      { date: addDays(today, 3), sky: "sun", high: 16, low: 6 },
      { date: addDays(today, 4), sky: "partly", high: 15, low: 8 },
    ],
  };
}
