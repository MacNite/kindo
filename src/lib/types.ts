/**
 * Domain model. These types are the contract between the UI and the server
 * (PostgreSQL, CalDAV, Immich…). Components only ever import from here and
 * from the service and state layers, never from the server or seed data.
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
  /** Every event is daily attendance (school, Kita): shown quietly. */
  background?: boolean;
  /** Lives on a connection (Nextcloud, Google, a feed) rather than in Kindo. */
  connectionId?: string;
  lastSyncAt?: Date;
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
  /** One occurrence of a recurring series: edited in the calendar app that owns it. */
  recurring?: boolean;
}

// ── Recurrence ──────────────────────────────────────────────────────────────
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday (JS convention)

export type Recurrence =
  | { kind: "daily" }
  | { kind: "weekdays"; days: Weekday[] }
  /** interval 1 = weekly, 2+ = every N weeks; `from` (YYYY-MM-DD) fixes which weeks, and nothing happens before it. */
  | { kind: "weekly"; day: Weekday; interval: number; from?: string }
  /** 29–31 fall on the last day of shorter months. */
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

/** One ticked-off routine step or chore on one household day (§19.3). */
export interface Completion {
  id: string;
  itemId: string;
  memberId: string | null;
  /** Household day, YYYY-MM-DD. */
  day: string;
  status: "done" | "pending";
  pictogram: string;
  label: Text;
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
  /** YYYY-MM-DD */
  day: string;
  /** `day` as a local date, filled in on the device. */
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
  /** YYYY-MM-DD. For yearly dates the original date, so ages can be counted. */
  date: string;
  yearly: boolean;
  memberId?: string;
}

/** An important date's next occurrence, computed for "today". */
export interface UpcomingDate extends ImportantDate {
  next: Date;
  /** Age or years, for yearly birthdays and anniversaries. */
  turns?: number;
}

// ── Photos ──────────────────────────────────────────────────────────────────
export interface PhotoAlbum { id: string; server: string; name: string; count: number; selected: boolean; weight: number }
/** A photo in the rotation. `src` is a proxied image; demo photos are drawn from `seed` instead. */
export interface Photo { id: string; albumId: string; seed?: number; src?: string; takenAt?: Date; place?: string }

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

/** A connection to an outside service, as an admin's Settings screen sees it: never its secret (§17). */
export interface ConnectionInfo {
  id: string;
  kind: "caldav" | "google" | "ics" | "immich" | "homeassistant";
  name: string;
  url?: string;
  username?: string;
  status: "ok" | "error" | "pending";
  lastError?: string;
  lastSyncAt?: Date;
  /** Non-secret, kind-specific settings. */
  config: Record<string, unknown>;
}

export interface Integration {
  id: "nextcloud" | "immich" | "google" | "ics" | "homeassistant";
  status: "connected" | "partial" | "off";
  detail?: Text;
}

// ── Who is looking ──────────────────────────────────────────────────────────
/** The signed-in person or paired wall display (§19.4), as far as the screens need to know. */
export interface Viewer {
  kind: "user" | "device";
  name: string;
  memberId?: string;
  role?: Role;
  /** May plan and change things (adults, or a wall unlocked with the PIN). */
  canManage: boolean;
  /** May change people, logins, devices and integrations. */
  isAdmin: boolean;
  /** A wall display that the PIN has unlocked for a few minutes. */
  elevated?: boolean;
  /** Has an admin set a settings PIN? */
  pinSet: boolean;
}

// ── Household snapshot ──────────────────────────────────────────────────────
export interface HouseholdSettings {
  name: string;
  timezone: string;
  /** HH:MM: when the household day (and so every routine) starts again. */
  dayStartsAt: string;
  morningUntil: string;
  afternoonUntil: string;
  holidayIcsUrls: string[];
  holidaysSyncedAt?: Date;
  holidaysError?: string;
  location?: string;
  rewardMode: RewardMode;
  /** Pocket-money mode: what one point is worth. */
  pointValue: number;
  idleMinutes: number;
  showPhotoMeta: boolean;
  widgets: WidgetConfig[];
  demo: boolean;
}

/**
 * Everything a screen needs, loaded in one round-trip and refreshed when the
 * server announces a change (§19.2). Family-sized, so it stays small.
 */
export interface HouseholdData {
  household: HouseholdSettings;
  viewer: Viewer;
  members: Member[];
  routines: Routine[];
  chores: Chore[];
  tasks: OneOffTask[];
  rewards: Reward[];
  balances: Record<string, number>;
  approvals: ApprovalRequest[];
  /** Recent completions, for "done" state and history. */
  completions: Completion[];
  shoppingLists: ShoppingList[];
  shoppingItems: ShoppingItem[];
  meals: Meal[];
  dates: ImportantDate[];
  sources: CalendarSource[];
  events: CalendarEvent[];
  albums: PhotoAlbum[];
  /** School holidays and public holidays from the household's feeds (§7). */
  holidays: { start: string; end: string; summary: string }[];
  weather: Weather | null;
  integrations: Integration[];
  /** Admins only; empty for everyone else. */
  connections: ConnectionInfo[];
}

/** The snapshot as it crosses the wire: dates of days are filled in on the device. */
export type HouseholdWire = Omit<HouseholdData, "meals"> & { meals: Omit<Meal, "date">[]; generatedAt: Date };

/** What every Server Action returns: production builds hide thrown messages, so errors travel as codes. */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };
