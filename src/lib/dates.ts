export const DAY = 86_400_000;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
export const at = (d: Date, h: number, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const daysUntil = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);

/** weekStartsOn: 0 = Sunday, 1 = Monday */
export function startOfWeek(d: Date, weekStartsOn: 0 | 1 = 1) {
  const s = startOfDay(d);
  const diff = (s.getDay() - weekStartsOn + 7) % 7;
  return addDays(s, -diff);
}

export function monthGrid(month: Date, weekStartsOn: 0 | 1) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first, weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const zoneFormats = new Map<string, Intl.DateTimeFormat | null>();
function zoneFormat(timeZone: string) {
  if (!zoneFormats.has(timeZone)) {
    let f: Intl.DateTimeFormat | null = null;
    try {
      f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    } catch {} // an unknown zone: fall back to the device's own clock
    zoneFormats.set(timeZone, f);
  }
  return zoneFormats.get(timeZone)!;
}

/**
 * `now` as the clock on the wall in `timeZone` reads it: a device-local Date
 * whose year, month, day, hours and minutes are the time there. Lets the
 * household day and its routines follow the household's time zone on a phone
 * set to another one. Without a (valid) zone it is `now` itself.
 */
export function wallClockIn(now: Date, timeZone?: string): Date {
  const f = timeZone ? zoneFormat(timeZone) : null;
  if (!f) return now;
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
}

export const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
