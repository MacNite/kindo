import { z } from "zod";

/** Input schemas for every server action. Nothing from the browser is trusted unparsed. */
export const id = z.string().min(1).max(64);
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");
export const text = z.union([z.string().trim().max(200), z.object({ de: z.string().max(200), en: z.string().max(200) })]);
export const requiredText = z.union([z.string().trim().min(1).max(200), z.object({ de: z.string().min(1).max(200), en: z.string().min(1).max(200) })]);
export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const pictogram = z.string().min(1).max(500);
export const weekday = z.number().int().min(0).max(6);

export const recurrence = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily") }),
  z.object({ kind: z.literal("weekdays"), days: z.array(weekday).min(1).max(7) }),
  z.object({ kind: z.literal("weekly"), day: weekday, interval: z.number().int().min(1).max(52), from: day.optional() }),
  z.object({ kind: z.literal("monthly"), dayOfMonth: z.number().int().min(1).max(31) }),
  z.object({ kind: z.literal("once"), date: day }),
  z.object({ kind: z.literal("schoolDays") }),
]);

export const taskValue = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("expected") }),
  z.object({ kind: z.literal("extra"), points: z.number().int().min(0).max(10_000), needsApproval: z.boolean() }),
]);

export const period = z.enum(["morning", "afternoon", "evening"]);
export const role = z.enum(["admin", "adult", "child"]);
export const rewardMode = z.enum(["off", "stars", "tokens", "money"]);
export const shoppingCategory = z.enum(["produce", "dairy", "bakery", "pantry", "frozen", "household", "hardware", "care", "other"]);
export const widgetId = z.enum(["clock", "weather", "agenda", "upcoming", "routines", "chores", "meals", "shopping", "dates", "photos"]);

export const avatar = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("emoji"), value: z.string().min(1).max(16) }),
  z.object({ kind: z.literal("initial") }),
  z.object({ kind: z.literal("photo"), url: z.string().url().max(2000) }),
]);

export const S = {
  completion: z.object({ itemId: id, memberId: id.nullable().optional(), day, done: z.boolean() }),
  resolveApproval: z.object({ id, ok: z.boolean() }),
  redeem: z.object({ memberId: id, rewardId: id }),
  rewardMode: z.object({ mode: rewardMode, pointValue: z.number().min(0).max(100).optional() }),
  reward: z.object({ id: id.optional(), emoji: z.string().min(1).max(16), title: requiredText, cost: z.number().int().min(1).max(100_000) }),
  byId: z.object({ id }),

  shoppingAdd: z.object({ id, listId: id, name: z.string().trim().min(1).max(200), memberId: id.optional(), qty: z.string().max(40).optional() }),
  shoppingDone: z.object({ id, done: z.boolean() }),
  shoppingClear: z.object({ listId: id }),
  shoppingList: z.object({ id: id.optional(), name: requiredText, icon: z.string().min(1).max(16) }),

  taskAdd: z.object({ id, title: z.string().trim().min(1).max(200), memberId: id.nullable(), due: z.coerce.date().optional() }),
  taskDone: z.object({ id, done: z.boolean() }),

  widgets: z.object({ widgets: z.array(z.object({ id: widgetId, enabled: z.boolean(), size: z.enum(["s", "m", "l"]) })).max(20) }),
  album: z.object({ id, selected: z.boolean().optional(), weight: z.number().int().min(0).max(100).optional() }),
  photoPrefs: z.object({ idleMinutes: z.number().min(0.25).max(240).optional(), showPhotoMeta: z.boolean().optional() }),

  household: z.object({ name: z.string().trim().min(1).max(80), timezone: z.string().min(1).max(64), location: z.string().trim().max(80).optional() }),
  dayTimes: z.object({ dayStartsAt: time, morningUntil: time, afternoonUntil: time })
    .refine((t) => t.morningUntil < t.afternoonUntil, { message: "morning ends before afternoon", path: ["afternoonUntil"] })
    .refine((t) => t.dayStartsAt < t.morningUntil, { message: "the day starts before morning ends", path: ["dayStartsAt"] }),
  holidayFeeds: z.object({ urls: z.array(z.string().trim().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "http(s) only")).max(5) }),
  member: z.object({ id: id.optional(), name: z.string().trim().min(1).max(40), role, color, avatar, birthday: day.optional() }),

  routineStep: z.object({
    /** Existing step to edit; omit to add one. */
    stepId: id.optional(),
    /** The routine the step belongs to; omit to start a new routine. */
    routineId: id.optional(),
    memberId: id,
    period,
    recurrence,
    pictogram,
    label: text,
  }),
  chore: z.object({ id: id.optional(), memberId: id.nullable(), pictogram, label: text, value: taskValue, recurrence }),

  meal: z.object({ day, dinner: z.string().trim().max(200), cookId: id.nullable().optional(), note: z.string().trim().max(200).optional() }),
  importantDate: z.object({
    id: id.optional(), kind: z.enum(["birthday", "anniversary", "school", "other"]), title: requiredText, date: day, yearly: z.boolean(), memberId: id.nullable().optional(),
  }),
  event: z.object({
    id: id.optional(), sourceId: id, title: z.string().trim().min(1).max(200), start: z.coerce.date(), end: z.coerce.date(), allDay: z.boolean(),
    memberIds: z.array(id).max(20), location: z.string().trim().max(200).optional(),
  }).refine((e) => e.end >= e.start, { message: "end before start", path: ["end"] }),
};
