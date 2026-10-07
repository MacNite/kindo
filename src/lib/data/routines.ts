import type { Chore, OneOffTask, Routine, TaskItem } from "../types";
import { addDays, at, dateKey } from "../dates";
import { TODAY } from "./anchor";

let n = 0;
const item = (pictogram: string, en: string, de: string, value: TaskItem["value"] = { kind: "expected" }): TaskItem =>
  ({ id: `t${n++}`, pictogram, label: { en, de }, value });

export const ROUTINES: Routine[] = [
  { id: "lena-morning", memberId: "lena", period: "morning", recurrence: { kind: "schoolDays" }, items: [
    item("bed", "Make bed", "Bett machen"),
    item("toothbrush", "Brush teeth", "Zähne putzen"),
    item("clothes", "Get dressed", "Anziehen"),
    item("backpack", "Pack school bag", "Schulranzen packen"),
  ] },
  { id: "lena-afternoon", memberId: "lena", period: "afternoon", recurrence: { kind: "schoolDays" }, items: [
    item("homework", "Homework", "Hausaufgaben"),
    item("lunchbox", "Empty lunch box", "Brotdose ausräumen"),
    item("music", "Piano practice", "Klavier üben"),
  ] },
  { id: "lena-evening", memberId: "lena", period: "evening", recurrence: { kind: "daily" }, items: [
    item("toys", "Tidy room", "Zimmer aufräumen"),
    item("pyjamas", "Pyjamas", "Schlafanzug"),
    item("toothbrush", "Brush teeth", "Zähne putzen"),
    item("book", "Reading time", "Lesezeit"),
  ] },
  { id: "paul-morning", memberId: "paul", period: "morning", recurrence: { kind: "daily" }, items: [
    item("toothbrush", "Brush teeth", "Zähne putzen"),
    item("clothes", "Get dressed", "Anziehen"),
    item("breakfast", "Breakfast", "Frühstück"),
    item("shoes", "Shoes on", "Schuhe an"),
  ] },
  { id: "paul-afternoon", memberId: "paul", period: "afternoon", recurrence: { kind: "daily" }, items: [
    item("toys", "Tidy toys", "Spielzeug aufräumen"),
    item("sun", "Play outside", "Draußen spielen"),
  ] },
  { id: "paul-evening", memberId: "paul", period: "evening", recurrence: { kind: "daily" }, items: [
    item("bath", "Bath", "Baden"),
    item("pyjamas", "Pyjamas", "Schlafanzug"),
    item("toothbrush", "Brush teeth", "Zähne putzen"),
    item("book", "Story", "Geschichte"),
    item("sleep", "Lights out", "Licht aus"),
  ] },
];

export const CHORES: Chore[] = [
  { id: "c-bins", memberId: "max", item: item("trash", "Take bins out", "Mülltonnen rausstellen"), recurrence: { kind: "weekly", day: 1, interval: 1 } },
  { id: "c-dish", memberId: "lena", item: item("dishes", "Empty dishwasher", "Spülmaschine ausräumen"), recurrence: { kind: "weekdays", days: [1, 3, 5] } },
  { id: "c-table", memberId: "paul", item: item("table", "Set the table", "Tisch decken"), recurrence: { kind: "daily" } },
  { id: "c-laundry", memberId: "anna", item: item("laundry", "Laundry", "Wäsche waschen"), recurrence: { kind: "weekdays", days: [1, 4] } },
  { id: "c-vacuum", memberId: "max", item: item("vacuum", "Vacuum downstairs", "Unten staubsaugen"), recurrence: { kind: "weekly", day: 5, interval: 1 } },
  { id: "c-bedding", memberId: "anna", item: item("bedding", "Change bedding", "Betten beziehen"), recurrence: { kind: "weekly", day: 6, interval: 2 } },
  { id: "c-plants", memberId: "paul", item: item("plants", "Water plants", "Blumen gießen"), recurrence: { kind: "weekdays", days: [3, 6] } },
  { id: "c-cat", memberId: null, item: item("cat", "Feed Mimi", "Mimi füttern"), recurrence: { kind: "daily" } },
  // Extras: optional contributions that earn rewards
  { id: "x-car", memberId: "lena", item: item("car", "Wash the car", "Auto waschen", { kind: "extra", points: 30, needsApproval: true }), recurrence: { kind: "once", date: dateKey(TODAY) } },
  { id: "x-garden", memberId: "paul", item: item("garden", "Help in the garden", "Im Garten helfen", { kind: "extra", points: 20, needsApproval: true }), recurrence: { kind: "weekdays", days: [TODAY.getDay() as 0] } },
  { id: "x-garage", memberId: "lena", item: item("garage", "Tidy the garage", "Garage aufräumen", { kind: "extra", points: 50, needsApproval: true }), recurrence: { kind: "weekly", day: 6, interval: 1 } },
  { id: "x-leaves", memberId: null, item: item("leaves", "Rake leaves", "Laub rechen", { kind: "extra", points: 25, needsApproval: true }), recurrence: { kind: "weekdays", days: [6, 0] } },
];

export const TASKS: OneOffTask[] = [
  { id: "o1", title: { en: "Sign zoo trip form", de: "Zoo-Ausflug unterschreiben" }, memberId: "anna", due: at(addDays(TODAY, 1), 8), done: false },
  { id: "o2", title: { en: "Order Lena's birthday cake", de: "Geburtstagstorte für Lena bestellen" }, memberId: "anna", due: addDays(TODAY, 5), done: false },
  { id: "o3", title: { en: "Return library books", de: "Bücherei-Bücher zurückbringen" }, memberId: "max", due: addDays(TODAY, -1), done: false },
  { id: "o4", title: { en: "Buy present for Oma", de: "Geschenk für Oma kaufen" }, memberId: "max", due: addDays(TODAY, 2), done: false },
  { id: "o5", title: { en: "Renew Paul's ID card", de: "Kinderausweis Paul verlängern" }, memberId: null, due: addDays(TODAY, 14), done: false },
  { id: "o6", title: { en: "Bleed the radiators", de: "Heizkörper entlüften" }, memberId: "max", done: true },
];
