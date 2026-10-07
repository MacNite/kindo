import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  Apple, Backpack, Bath, Bed, BedDouble, Bike, BookOpen, Car, CookingPot, Dog, Droplets, Flower2, Footprints,
  Moon, Music, Recycle, Shirt, ShoppingBasket, Sparkles, Sprout, Sun, ToyBrick, Trash2, Utensils,
  WashingMachine, Wrench, Hammer, Shovel, Baby, Cat, Glasses, Pencil, Leaf, Sandwich, Soup, Milk, Package,
} from "lucide-react";
import type { Text } from "./types";

/**
 * One visual language for every task: Lucide's 24px / 2px-stroke icons.
 * The few gaps (toothbrush, vacuum, pyjamas, hair) are drawn on the same grid
 * so they sit naturally beside the rest.
 */
type Icon = ComponentType<LucideProps>;

const base = { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const Toothbrush: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M4 20 14.5 9.5" />
    <rect x="13.2" y="3.2" width="5" height="8.5" rx="1.5" transform="rotate(45 15.7 7.45)" />
    <path d="M16 4.5 17.2 3.3M18.2 6.7l1.2-1.2M20.4 8.9l1.2-1.2" />
  </svg>
);
const Vacuum: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M14 3h-1a3 3 0 0 0-3 3v9" />
    <path d="M4 18a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v1H4z" />
    <circle cx="7" cy="20.5" r="0.5" />
    <path d="M14 3h4" />
  </svg>
);
const Pyjamas: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M8 3 4 5.5 5.5 10 7.5 9V21h9V9l2 1L20 5.5 16 3a4 4 0 0 1-8 0Z" />
    <path d="M14.5 13.2a2 2 0 1 1-2.2-2.7 1.6 1.6 0 0 0 2.2 2.7Z" />
  </svg>
);
const Hairbrush: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <ellipse cx="9" cy="8" rx="5" ry="5.5" />
    <path d="M12.5 12 20 20.5" />
    <path d="M7 6.5h.01M10 6h.01M8 9h.01M11 9h.01" />
  </svg>
);

export type PictoCategory = "morning" | "household" | "evening" | "outdoor" | "school";

export interface Pictogram { id: string; Icon: Icon; label: Text; category: PictoCategory }

const P = (id: string, Icon: Icon, category: PictoCategory, en: string, de: string): Pictogram => ({ id, Icon, category, label: { en, de } });

export const PICTOGRAMS: Pictogram[] = [
  P("bed", Bed, "morning", "Make bed", "Bett machen"),
  P("toothbrush", Toothbrush, "morning", "Brush teeth", "Zähne putzen"),
  P("clothes", Shirt, "morning", "Get dressed", "Anziehen"),
  P("breakfast", Apple, "morning", "Breakfast", "Frühstück"),
  P("backpack", Backpack, "morning", "Pack school bag", "Schulranzen packen"),
  P("hair", Hairbrush, "morning", "Brush hair", "Haare kämmen"),
  P("shoes", Footprints, "morning", "Shoes on", "Schuhe anziehen"),
  P("lunchbox", Sandwich, "morning", "Lunch box", "Brotdose"),

  P("dishes", Utensils, "household", "Dishes", "Geschirr"),
  P("laundry", WashingMachine, "household", "Laundry", "Wäsche"),
  P("vacuum", Vacuum, "household", "Vacuum", "Staubsaugen"),
  P("trash", Trash2, "household", "Take out trash", "Müll rausbringen"),
  P("recycling", Recycle, "household", "Recycling", "Gelber Sack"),
  P("toys", ToyBrick, "household", "Tidy toys", "Spielzeug aufräumen"),
  P("room", Sparkles, "household", "Clean room", "Zimmer aufräumen"),
  P("cook", CookingPot, "household", "Help cook", "Beim Kochen helfen"),
  P("table", Soup, "household", "Set the table", "Tisch decken"),
  P("groceries", ShoppingBasket, "household", "Unpack shopping", "Einkauf auspacken"),
  P("bedding", BedDouble, "household", "Change bedding", "Bett beziehen"),
  P("cat", Cat, "household", "Feed the cat", "Katze füttern"),
  P("milk", Milk, "household", "Fridge check", "Kühlschrank prüfen"),
  P("parcel", Package, "household", "Bring in parcels", "Pakete reinholen"),

  P("bath", Bath, "evening", "Bath", "Baden"),
  P("pyjamas", Pyjamas, "evening", "Pyjamas", "Schlafanzug"),
  P("book", BookOpen, "evening", "Read a book", "Buch lesen"),
  P("sleep", Moon, "evening", "Bedtime", "Schlafenszeit"),
  P("wash", Droplets, "evening", "Wash face", "Gesicht waschen"),
  P("glasses", Glasses, "evening", "Glasses away", "Brille weglegen"),

  P("garden", Sprout, "outdoor", "Help in garden", "Im Garten helfen"),
  P("plants", Flower2, "outdoor", "Water plants", "Blumen gießen"),
  P("car", Car, "outdoor", "Wash car", "Auto waschen"),
  P("garage", Wrench, "outdoor", "Clean garage", "Garage aufräumen"),
  P("tools", Hammer, "outdoor", "Help fix things", "Beim Reparieren helfen"),
  P("leaves", Leaf, "outdoor", "Rake leaves", "Laub rechen"),
  P("snow", Shovel, "outdoor", "Clear snow", "Schnee schippen"),
  P("dog", Dog, "outdoor", "Walk the dog", "Gassi gehen"),
  P("bike", Bike, "outdoor", "Bike away", "Fahrrad wegstellen"),

  P("homework", Pencil, "school", "Homework", "Hausaufgaben"),
  P("music", Music, "school", "Practise music", "Musik üben"),
  P("baby", Baby, "school", "Kindergarten", "Kita"),
  P("sun", Sun, "school", "Outside play", "Draußen spielen"),
];

const byId = new Map(PICTOGRAMS.map((p) => [p.id, p]));
export const getPictogram = (id: string) => byId.get(id);

export const PICTO_CATEGORIES: PictoCategory[] = ["morning", "household", "evening", "outdoor", "school"];

/** Emoji set offered as an alternative to built-in pictograms. */
export const EMOJI_CHOICES = ["🛏️", "🪥", "👕", "🎒", "🥣", "🧸", "🧺", "🧹", "🗑️", "🛁", "📖", "🌙", "🐱", "🌱", "🚗", "🎹", "⚽", "🦷", "🧦", "🍽️"];
