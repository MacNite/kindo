import type { Integration } from "../types";

export const INTEGRATIONS: Integration[] = [
  { id: "nextcloud", status: "connected", detail: { en: "2 calendars · synced 4 min ago", de: "2 Kalender · vor 4 Min. synchronisiert" } },
  { id: "immich", status: "connected", detail: { en: "2 servers · 4 albums in rotation", de: "2 Server · 4 Alben in Rotation" } },
  { id: "google", status: "partial", detail: { en: "1 read-only calendar", de: "1 Kalender, nur lesen" } },
  { id: "ics", status: "connected", detail: { en: "School holidays, waste collection", de: "Schulferien, Abfallkalender" } },
  { id: "homeassistant", status: "off" },
];
