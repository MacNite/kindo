import type { CalendarEvent, CalendarSource } from "../types";
import { addDays, at, startOfWeek } from "../dates";
import { TODAY } from "./anchor";

export const CALENDAR_SOURCES: CalendarSource[] = [
  { id: "nc-family", provider: "caldav", name: { en: "Family", de: "Familie" }, account: "cloud.mueller.home", defaultMemberIds: [], readOnly: false },
  { id: "nc-anna", provider: "caldav", name: "Anna", account: "cloud.mueller.home", defaultMemberIds: ["anna"], readOnly: false },
  { id: "g-max", provider: "google", name: { en: "Max – work", de: "Max – Arbeit" }, account: "max.mueller@gmail.com", defaultMemberIds: ["max"], readOnly: true },
  { id: "ics-school", provider: "ics", name: { en: "Lindenhof Primary", de: "Grundschule Lindenhof" }, account: "schule-lindenhof.de", defaultMemberIds: ["lena"], readOnly: true },
  { id: "ics-waste", provider: "ics", name: { en: "Waste collection", de: "Abfallkalender" }, account: "awb-stadt.de", defaultMemberIds: [], readOnly: true },
  { id: "local", provider: "local", name: { en: "On this device", de: "Lokal" }, defaultMemberIds: [], readOnly: false },
];

let n = 0;
const ev = (e: Omit<CalendarEvent, "id">): CalendarEvent => ({ id: `ev${n++}`, ...e });

/** Builds ~7 weeks of believable family life around today. */
function build(): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const week0 = startOfWeek(TODAY, 1);
  for (let w = -2; w <= 5; w++) {
    const mon = addDays(week0, w * 7);
    for (let d = 0; d < 5; d++) {
      const day = addDays(mon, d);
      out.push(ev({ title: { en: "School", de: "Schule" }, start: at(day, 8), end: at(day, d === 2 ? 11 : 13, 15), memberIds: ["lena"], sourceId: "ics-school", icon: "backpack", background: true }));
      out.push(ev({ title: "Kita", start: at(day, 8), end: at(day, 12, 30), memberIds: ["paul"], sourceId: "nc-family", icon: "baby", location: "Kita Sonnenblume", background: true }));
    }
    const tue = addDays(mon, 1), wed = addDays(mon, 2), thu = addDays(mon, 3), fri = addDays(mon, 4), sat = addDays(mon, 5), sun = addDays(mon, 6);
    out.push(ev({ title: { en: "Bins out – general waste", de: "Restmüll" }, start: tue, end: tue, allDay: true, memberIds: [], sourceId: "ics-waste", icon: "trash" }));
    if (w % 2 === 0) out.push(ev({ title: { en: "Recycling collection", de: "Gelber Sack" }, start: fri, end: fri, allDay: true, memberIds: [], sourceId: "ics-waste", icon: "recycling" }));
    out.push(ev({ title: { en: "Football practice", de: "Fußballtraining" }, start: at(wed, 16, 30), end: at(wed, 18), memberIds: ["lena", "max"], sourceId: "nc-family", location: "TSV Sportplatz" }));
    out.push(ev({ title: { en: "Swimming lesson", de: "Schwimmkurs" }, start: at(fri, 15), end: at(fri, 15, 45), memberIds: ["paul", "anna"], sourceId: "nc-family", location: "Hallenbad Nord" }));
    out.push(ev({ title: "Yoga", start: at(mon, 19, 30), end: at(mon, 20, 45), memberIds: ["anna"], sourceId: "nc-anna" }));
    out.push(ev({ title: { en: "Team meeting", de: "Teammeeting" }, start: at(addDays(mon, 0), 9), end: at(addDays(mon, 0), 10), memberIds: ["max"], sourceId: "g-max" }));
    out.push(ev({ title: { en: "Handball", de: "Handball" }, start: at(thu, 20), end: at(thu, 21, 30), memberIds: ["max"], sourceId: "nc-family" }));
    out.push(ev({ title: { en: "Piano", de: "Klavier" }, start: at(tue, 15, 30), end: at(tue, 16, 15), memberIds: ["lena"], sourceId: "nc-family", icon: "music" }));
    out.push(ev({ title: { en: "Farmers' market", de: "Wochenmarkt" }, start: at(sat, 9, 30), end: at(sat, 11), memberIds: [], sourceId: "nc-family" }));
    if (w % 2 === 1) out.push(ev({ title: { en: "Lunch at Oma's", de: "Mittagessen bei Oma" }, start: at(sun, 12), end: at(sun, 15), memberIds: [], sourceId: "nc-family" }));
  }
  // One-offs around today
  const t = TODAY;
  out.push(ev({ title: { en: "Dentist – Paul", de: "Zahnarzt – Paul" }, start: at(addDays(t, 1), 10), end: at(addDays(t, 1), 10, 45), memberIds: ["paul", "anna"], sourceId: "nc-anna", location: "Dr. Schreiber" }));
  out.push(ev({ title: { en: "Parents' evening", de: "Elternabend" }, start: at(addDays(t, 6), 19, 30), end: at(addDays(t, 6), 21), memberIds: ["anna", "max"], sourceId: "ics-school", location: "Grundschule Lindenhof" }));
  out.push(ev({ title: { en: "Oma Ingrid's birthday", de: "Geburtstag Oma Ingrid" }, start: addDays(t, 4), end: addDays(t, 4), allDay: true, memberIds: [], sourceId: "nc-family" }));
  out.push(ev({ title: { en: "Lena's birthday", de: "Lenas Geburtstag" }, start: addDays(t, 12), end: addDays(t, 12), allDay: true, memberIds: ["lena"], sourceId: "nc-family" }));
  out.push(ev({ title: { en: "School trip to the zoo", de: "Ausflug in den Zoo" }, start: at(addDays(t, 9), 8), end: at(addDays(t, 9), 15), memberIds: ["lena"], sourceId: "ics-school" }));
  out.push(ev({ title: { en: "Call with the landlord", de: "Telefonat Vermieter" }, start: at(t, 17, 30), end: at(t, 18), memberIds: ["max"], sourceId: "local" }));
  out.push(ev({ title: { en: "Haircut", de: "Friseur" }, start: at(t, 14), end: at(t, 14, 45), memberIds: ["anna"], sourceId: "nc-anna", location: "Salon Kamm" }));
  out.push(ev({ title: { en: "Playdate with Mia", de: "Spielen bei Mia" }, start: at(addDays(t, 2), 15), end: at(addDays(t, 2), 17), memberIds: ["lena"], sourceId: "nc-family" }));
  out.push(ev({ title: { en: "Winter tyres", de: "Winterreifen wechseln" }, start: at(addDays(t, 3), 8), end: at(addDays(t, 3), 9), memberIds: ["max"], sourceId: "local", location: "Autohaus Berg" }));
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export const EVENTS = build();
