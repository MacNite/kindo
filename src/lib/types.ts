/**
 * Domain model. These types are the contract between the UI and whatever
 * eventually supplies data (local DB, CalDAV, Immich…). Components only ever
 * import from here and from the service layer — never from mock files directly.
 */

/** User-entered text is a plain string. Mock data ships both languages so the
 *  demo reads naturally in either UI language. */
export type Text = string | { de: string; en: string };

export type Role = "admin" | "adult" | "child";

export interface Member {
  id: string;
  name: string;
  role: Role;
  color: string; // hex
  avatar: { kind: "emoji"; value: string } | { kind: "initial" } | { kind: "photo"; url: string };
  birthday?: string; // ISO date
  /** People and accounts are separate: children usually have none. */
  account?: { email: string; lastSeen?: string };
}

// ── Calendar ────────────────────────────────────────────────────────────────
export type CalendarProvider = "caldav" | "google" | "ics" | "local";

export interface CalendarSource {
  id: string;
  provider: CalendarProvider;
  name: Text;
  account?: string; // e.g. "cloud.mueller.home"
  defaultMemberIds: string[];
  readOnly: boolean;
}

export interface CalendarEvent {
  id: string;
  title: Text;
  start: Date;
  end: Date;
  allDay?: boolean;
  memberIds: string[]; // empty = whole family
  sourceId: string;
  location?: string;
  icon?: string; // pictogram id
  /** Daily attendance like school or Kita: shown quietly, left out of "coming up". */
  background?: boolean;
}

// ── Recurrence ──────────────────────────────────────────────────────────────
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday (JS convention)

export type Recurrence =
  | { kind: "daily" }
  | { kind: "weekdays"; days: Weekday[] }
  | { kind: "weekly"; day: Weekday; interval: number } // interval 1 = weekly, 2+ = every N weeks
  | { kind: "monthly"; dayOfMonth: number }
  | { kind: "once"; date: string }
  | { kind: "schoolDays" };

// ── Routines, chores, tasks ─────────────────────────────────────────────────
export type Period = "morning" | "afternoon" | "evening";

/** Expected routines earn nothing; extras can earn a reward. */
export type TaskValue = { kind: "expected" } | { kind: "extra"; points: number; needsApproval: boolean };

export interface TaskItem {
  id: string;
  pictogram: string; // id from the pictogram library, "emoji:🐱" or "img:<url>"
  label: Text;
  value: TaskValue;
}

export interface Routine {
  id: string;
  memberId: string;
  period: Period;
  recurrence: Recurrence;
  items: TaskItem[];
}

export interface Chore {
  id: string;
  memberId: string | null; // null = anyone
  item: TaskItem;
  recurrence: Recurrence;
}

export interface OneOffTask {
  id: string;
  title: Text;
  memberId: string | null;
  due?: Date;
  done: boolean;
}

// ── Rewards ─────────────────────────────────────────────────────────────────
export type RewardMode = "off" | "stars" | "tokens" | "money";

export interface Reward {
  id: string;
  emoji: string;
  title: Text;
  cost: number;
}

export interface ApprovalRequest {
  id: string;
  memberId: string;
  item: TaskItem;
  /** Day the item was ticked for (YYYY-MM-DD). */
  day: string;
  at: Date;
}

// ── Shopping & meals ────────────────────────────────────────────────────────
export type ShoppingCategory = "produce" | "dairy" | "bakery" | "pantry" | "frozen" | "household" | "hardware" | "care" | "other";

export interface ShoppingList { id: string; name: Text; icon: string }
export interface ShoppingItem {
  id: string;
  listId: string;
  name: Text;
  qty?: string;
  category: ShoppingCategory;
  memberId?: string;
  done: boolean;
}

export interface Meal {
  date: Date;
  dinner: Text;
  cookId?: string;
  note?: Text;
}

// ── Dates ───────────────────────────────────────────────────────────────────
export type ImportantDateKind = "birthday" | "anniversary" | "school" | "other";
export interface ImportantDate {
  id: string;
  kind: ImportantDateKind;
  title: Text;
  date: Date; // next occurrence
  memberId?: string;
  turns?: number;
}

// ── Photos ──────────────────────────────────────────────────────────────────
export interface PhotoServer { id: string; kind: "immich"; name: string; url: string; status: "connected" | "error" }
export interface PhotoAlbum { id: string; serverId: string; name: string; count: number; selected: boolean; weight: number }
export interface Photo { id: string; albumId: string; seed: number; takenAt: Date; place?: string }

// ── Weather & dashboard ─────────────────────────────────────────────────────
export type Sky = "sun" | "partly" | "cloud" | "rain" | "snow";
export interface Weather {
  place: string;
  now: number;
  sky: Sky;
  high: number;
  low: number;
  rainChance: number;
  days: { date: Date; sky: Sky; high: number; low: number }[];
}

export type WidgetId = "clock" | "weather" | "agenda" | "upcoming" | "routines" | "chores" | "meals" | "shopping" | "dates" | "photos";
export type WidgetSize = "s" | "m" | "l";
export interface WidgetConfig { id: WidgetId; enabled: boolean; size: WidgetSize }

export interface Integration {
  id: "nextcloud" | "immich" | "google" | "ics" | "homeassistant";
  status: "connected" | "partial" | "off";
  detail?: Text;
}
