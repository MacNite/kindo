import type { Weather } from "../types";
import { addDays } from "../dates";
import { TODAY } from "./anchor";

export const WEATHER: Weather = {
  place: "Freiburg",
  now: 14, sky: "partly", high: 17, low: 8, rainChance: 20,
  days: [
    { date: addDays(TODAY, 1), sky: "rain", high: 13, low: 9 },
    { date: addDays(TODAY, 2), sky: "cloud", high: 12, low: 7 },
    { date: addDays(TODAY, 3), sky: "sun", high: 16, low: 6 },
    { date: addDays(TODAY, 4), sky: "partly", high: 15, low: 8 },
  ],
};
