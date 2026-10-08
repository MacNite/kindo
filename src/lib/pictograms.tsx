import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  Apple, Backpack, Bath, Bed, BedDouble, Bike, BookOpen, Car, CookingPot, Dog, Flower2, Footprints,
  Moon, Music, Recycle, Shirt, ShoppingBasket, Sparkles, Sprout, Sun, ToyBrick, Trash2, Utensils,
  WashingMachine, Wrench, Hammer, Shovel, Baby, Cat, Glasses, Pencil, Leaf, Soup, Milk, Package,
  AlarmClock, Bandage, Bird, Blocks, BrushCleaning, Bus, Fish, GlassWater, Lamp, Palette, Pill, Puzzle, Rabbit,
  Scissors, ShowerHead, SoapDispenserDroplet, Toilet, Tv, Volleyball, Waves,
} from "lucide-react";
import type { Text } from "./types";

/**
 * One visual language for every task: Lucide's 24px / 2px-stroke icons.
 * The gaps (toothbrush, washing hands, towel, teddy and a few more) are drawn on the same grid
 * so they sit naturally beside the rest.
 */
type Icon = ComponentType<LucideProps>;

const base = { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const Toothbrush: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M3 16.5h9" />
    <path d="M12 14.5h8a2 2 0 0 1 0 4h-8z" />
    <path d="M13.5 14.5v-4M16.5 14.5v-4M19.5 14.5v-4" />
    <path d="M12.5 7.5c1.2-1.6 2.8-1.6 4 0s2.8 1.6 4 0" />
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
const Comb: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <g transform="rotate(-25 12 12)">
      <rect x="2.5" y="7.5" width="19" height="4" rx="1.5" />
      <path d="M4.5 11.5v5M7.5 11.5v5M10.5 11.5v5M13.5 11.5v5M16.5 11.5v5M19.5 11.5v5" />
    </g>
  </svg>
);
const LunchBox: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M3 12h18v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M5.5 12 9 4.5l5.5 7.5M7 9.2h5" />
    <path d="M17.5 7c-1.8-1.3-4 0-3.3 2.6.3 1.2 1.3 2.4 2.3 2.4h2c1 0 2-1.2 2.3-2.4.7-2.6-1.5-3.9-3.3-2.6zm0 0c0-1.2.5-2 1.5-2.5" />
  </svg>
);

const HandWash: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <g transform="translate(6.5 6.5) scale(0.7)" strokeWidth={Number(strokeWidth) / 0.7}>
      <path d="M18 11V6a2 2 0 0 0-4 0" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </g>
    <path d="M5 11a2 2 0 0 0 2-2c0-1.2-1-2-2-3.5C4 7 3 7.8 3 9a2 2 0 0 0 2 2z" />
    <path d="M10 6a1.5 1.5 0 0 0 1.5-1.5c0-.8-.7-1.4-1.5-2.5-.8 1.1-1.5 1.7-1.5 2.5A1.5 1.5 0 0 0 10 6z" />
  </svg>
);
const FaceWash: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M17 13.5A7.5 7.5 0 1 1 10.5 6" />
    <path d="M7.5 12h.01M13.5 12h.01" />
    <path d="M8 16a3.5 3.5 0 0 0 5 0" />
    <path d="M18 10a2.5 2.5 0 0 0 2.5-2.5C20.5 6 19.3 5 18 3c-1.3 2-2.5 3-2.5 4.5A2.5 2.5 0 0 0 18 10z" />
  </svg>
);
const HairWash: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M5 12a7 7 0 0 0 14 0" />
    <path d="M5 12a2.5 2.5 0 0 1 1-4.8 3.3 3.3 0 0 1 6-2.2 3.3 3.3 0 0 1 6 2.2 2.5 2.5 0 0 1 1 4.8z" />
    <path d="M9.5 14.5h.01M14.5 14.5h.01M10.5 16.5a2 2 0 0 0 3 0" />
  </svg>
);
const Towel: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M3 4h18" />
    <path d="M6 4v15a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4" />
    <path d="M6 14.5h12M6 17h12" />
  </svg>
);
const Tissue: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M3 13h18v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M8.5 13c0-2.5-1.5-4-.5-8 1.5 1 3 1 4-1 1 2 2.5 2 4 1 1 4-.5 5.5-.5 8" />
  </svg>
);
const Cream: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M6 3h10l-2 12H8z" />
    <path d="M6 5.5h10" />
    <path d="M9 15h4v4a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1z" />
    <path d="M19 21a1.5 1.5 0 0 0 1.5-1.5c0-.8-.7-1.4-1.5-2.5-.8 1.1-1.5 1.7-1.5 2.5A1.5 1.5 0 0 0 19 21z" />
  </svg>
);
const Jacket: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M8.5 3 5 4.5A2 2 0 0 0 3.8 6.3L3 19a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1l-.8-12.7A2 2 0 0 0 19 4.5L15.5 3" />
    <path d="M8.5 3 12 7l3.5-4" />
    <path d="M12 7v13M7 9v11M17 9v11" />
  </svg>
);
const Beanie: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M5 16a7 7 0 0 1 14 0" />
    <rect x="4" y="16" width="16" height="4" rx="1" />
    <circle cx="12" cy="6.5" r="2" />
  </svg>
);
const Dishwasher: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 8h18M7 5.5h.01M10 5.5h.01" />
    <path d="M7 17h10M8.5 17v-5M11.5 17v-5M14.5 17v-3.5" />
  </svg>
);
const FoldedClothes: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <rect x="3" y="15" width="18" height="5" rx="1" />
    <path d="M5 15v-4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v4" />
    <path d="M7 10V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v5" />
    <path d="M10 4l2 2 2-2" />
  </svg>
);
const Teddy: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M8.7 5.2a1.6 1.6 0 1 1 2.3-1.6M13 3.6a1.6 1.6 0 1 1 2.3 1.6" />
    <circle cx="12" cy="7.5" r="4" />
    <path d="M10.4 6.6h.01M13.6 6.6h.01M11 9.2h2" />
    <path d="M9.3 11a6 5.5 0 1 0 5.4 0" />
    <path d="M6.3 14.5 4 13M17.7 14.5 20 13" />
  </svg>
);
const Hanger: Icon = ({ strokeWidth = 2, size: _s, absoluteStrokeWidth: _a, ...p }) => (
  <svg {...base} strokeWidth={strokeWidth} {...p}>
    <path d="M10 5.5a2 2 0 1 1 2 2V9" />
    <path d="M12 9 2.8 16.2A1 1 0 0 0 3.4 18h17.2a1 1 0 0 0 .6-1.8z" />
  </svg>
);

export type PictoCategory = "morning" | "care" | "household" | "evening" | "outdoor" | "school";

export interface Pictogram { id: string; Icon: Icon; label: Text; category: PictoCategory }

const P = (id: string, Icon: Icon, category: PictoCategory, en: string, de: string): Pictogram => ({ id, Icon, category, label: { en, de } });

export const PICTOGRAMS: Pictogram[] = [
  P("bed", Bed, "morning", "Make bed", "Bett machen"),
  P("clothes", Shirt, "morning", "Get dressed", "Anziehen"),
  P("breakfast", Apple, "morning", "Breakfast", "Frühstück"),
  P("backpack", Backpack, "morning", "Pack school bag", "Schulranzen packen"),
  P("shoes", Footprints, "morning", "Shoes on", "Schuhe anziehen"),
  P("lunchbox", LunchBox, "morning", "Lunch box", "Brotdose"),
  P("water", GlassWater, "morning", "Drink water", "Wasser trinken"),
  P("alarm", AlarmClock, "morning", "Get up", "Aufstehen"),
  P("jacket", Jacket, "morning", "Jacket on", "Jacke anziehen"),
  P("hat", Beanie, "morning", "Hat on", "Mütze aufsetzen"),

  P("toothbrush", Toothbrush, "care", "Brush teeth", "Zähne putzen"),
  P("handwash", HandWash, "care", "Wash hands", "Hände waschen"),
  P("wash", FaceWash, "care", "Wash face", "Gesicht waschen"),
  P("shower", ShowerHead, "care", "Shower", "Duschen"),
  P("bath", Bath, "care", "Bath", "Baden"),
  P("hairwash", HairWash, "care", "Wash hair", "Haare waschen"),
  P("hair", Comb, "care", "Brush hair", "Haare kämmen"),
  P("soap", SoapDispenserDroplet, "care", "Use soap", "Mit Seife waschen"),
  P("towel", Towel, "care", "Dry off", "Abtrocknen"),
  P("toilet", Toilet, "care", "Toilet", "Toilette"),
  P("nose", Tissue, "care", "Blow nose", "Nase putzen"),
  P("cream", Cream, "care", "Put on cream", "Eincremen"),
  P("nails", Scissors, "care", "Cut nails", "Nägel schneiden"),
  P("medicine", Pill, "care", "Medicine", "Medizin nehmen"),
  P("plaster", Bandage, "care", "Plaster", "Pflaster"),

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
  P("sweep", BrushCleaning, "household", "Sweep", "Fegen"),
  P("dishwasher", Dishwasher, "household", "Empty dishwasher", "Spülmaschine ausräumen"),
  P("folding", FoldedClothes, "household", "Fold laundry", "Wäsche zusammenlegen"),
  P("fish", Fish, "household", "Feed the fish", "Fische füttern"),
  P("rabbit", Rabbit, "household", "Feed the rabbit", "Hasen füttern"),
  P("bird", Bird, "household", "Feed the birds", "Vögel füttern"),

  P("pyjamas", Pyjamas, "evening", "Pyjamas", "Schlafanzug"),
  P("book", BookOpen, "evening", "Read a book", "Buch lesen"),
  P("sleep", Moon, "evening", "Bedtime", "Schlafenszeit"),
  P("glasses", Glasses, "evening", "Glasses away", "Brille weglegen"),
  P("lamp", Lamp, "evening", "Lights off", "Licht aus"),
  P("teddy", Teddy, "evening", "Cuddly toy", "Kuscheltier"),
  P("outfit", Hanger, "evening", "Lay out clothes", "Kleidung rauslegen"),

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
  P("paint", Palette, "school", "Painting", "Malen"),
  P("puzzle", Puzzle, "school", "Puzzle", "Puzzeln"),
  P("blocks", Blocks, "school", "Building blocks", "Bauklötze"),
  P("ball", Volleyball, "school", "Ball games", "Ballspielen"),
  P("swim", Waves, "school", "Swimming", "Schwimmen"),
  P("bus", Bus, "school", "Bus", "Bus fahren"),
  P("tv", Tv, "school", "Screen time", "Bildschirmzeit"),
];

const byId = new Map(PICTOGRAMS.map((p) => [p.id, p]));
export const getPictogram = (id: string) => byId.get(id);

export const PICTO_CATEGORIES: PictoCategory[] = ["morning", "care", "household", "evening", "outdoor", "school"];

/** Emoji set offered as an alternative to built-in pictograms. */
export const EMOJI_CHOICES = ["🛏️", "🪥", "👕", "🎒", "🥣", "🧸", "🧺", "🧹", "🗑️", "🛁", "📖", "🌙", "🐱", "🌱", "🚗", "🎹", "⚽", "🦷", "🧦", "🍽️", "🧼", "🚿", "🪒", "🧴", "🚽", "💧"];
