import { startOfDay } from "../dates";
/**
 * Mock data is generated relative to the day the app loaded, so the demo
 * always looks current. This is the data anchor only: UI that needs "today"
 * uses `useToday()`, which rolls over at midnight.
 */
export const TODAY = startOfDay(new Date());
