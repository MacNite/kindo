import type { CalendarEvent, Member } from "./types";
import { addDays, startOfDay } from "./dates";

/**
 * The wall's "Next up" (§4, D69): the household's earliest timed commitment
 * that is still ahead, whoever it belongs to.
 *
 * - Background events (school, Kita) never take the slot; they are a frame
 *   for the day, not something to get ready for.
 * - All-day events never take it either: they have no time to be ready by.
 *   They stay in the lanes and the row of whole-family events.
 * - An event that has begun stays "now" for its first ten minutes (the family
 *   is leaving or running late), then gives way to what comes next. It is
 *   still marked "now" in its person's lane.
 * - Only today and tomorrow count, so the evening already shows the morning's
 *   first appointment, but next week's dentist doesn't sit there for days.
 * - Events starting in the same minute are shown together, the one for the
 *   whole family (or the most people) first, then by the lanes' order.
 */
export const NOW_GRACE_MS = 10 * 60_000;

export interface NextUpItem {
  event: CalendarEvent;
  /** The people it belongs to, in the lanes' order. Empty for the whole family. */
  owners: Member[];
  /** For everyone: no one named, or everyone named. */
  family: boolean;
}

export interface NextUp {
  start: Date;
  /** Started already, within the grace period. */
  now: boolean;
  /** Starts on tomorrow's date. */
  tomorrow: boolean;
  /** Every event starting in that minute; the first is the one shown large. */
  items: NextUpItem[];
}

const minute = (d: Date) => Math.floor(d.getTime() / 60_000);

export function nextUp(events: readonly CalendarEvent[], members: readonly Member[], now: Date): NextUp | null {
  const horizon = addDays(startOfDay(now), 2);
  const order = new Map(members.map((m, i) => [m.id, i]));
  const candidates = events.filter((e) =>
    !e.background && !e.allDay && e.end > now && e.start < horizon && e.start.getTime() >= now.getTime() - NOW_GRACE_MS);
  if (!candidates.length) return null;

  const first = Math.min(...candidates.map((e) => minute(e.start)));
  const items = candidates.filter((e) => minute(e.start) === first).map((event): NextUpItem => {
    const owners = members.filter((m) => event.memberIds.includes(m.id));
    const family = event.memberIds.length === 0 || (members.length > 1 && owners.length === members.length);
    return { event, owners: family ? [] : owners, family };
  });
  const rank = (i: NextUpItem) => (i.family ? -1 : order.get(i.owners[0]?.id ?? "") ?? members.length);
  items.sort((a, b) => Number(b.family) - Number(a.family) || b.owners.length - a.owners.length || rank(a) - rank(b)
    || a.event.id.localeCompare(b.event.id));

  const start = items[0].event.start;
  return { start, now: start <= now, tomorrow: startOfDay(start).getTime() !== startOfDay(now).getTime(), items };
}

/**
 * Short labels for people, readable across the kitchen: initials ("AL" for
 * Anna-Lena), or the first letters as far as needed where two would read the
 * same (Max and Mia become "Ma" and "Mi").
 */
export function shortNames(members: readonly Member[]): Map<string, string> {
  const words = (name: string) => name.trim().split(/[\s-]+/).filter(Boolean);
  const initials = (name: string) => words(name).slice(0, 2).map((w) => [...w][0]?.toUpperCase() ?? "").join("") || "?";
  const out = new Map<string, string>();
  for (const m of members) {
    let label = initials(m.name);
    const clash = members.some((o) => o.id !== m.id && initials(o.name) === label);
    if (clash) {
      // As many letters as it takes to differ from everyone with the same initials.
      const chars = [...m.name.trim()];
      const rivals = members.filter((o) => o.id !== m.id && initials(o.name) === label).map((o) => [...o.name.trim()]);
      let n = 2;
      while (n < chars.length && rivals.some((r) => r.slice(0, n).join("") === chars.slice(0, n).join(""))) n++;
      label = chars.slice(0, n).join("");
    }
    out.set(m.id, label);
  }
  return out;
}
