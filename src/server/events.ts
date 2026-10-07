import type { Event as EventRow, Prisma } from "@prisma/client";
import type { CalendarEvent, Text } from "@/lib/types";
import { allDayForStorage } from "@/lib/events";

/** A domain event as the columns it is stored in (all-day dates at UTC midnight). */
export function toStoredEvent(e: Omit<CalendarEvent, "id">) {
  return {
    sourceId: e.sourceId,
    title: e.title as Prisma.InputJsonValue,
    ...allDayForStorage(e),
    allDay: e.allDay ?? false,
    memberIds: e.memberIds,
    location: e.location ?? null,
    icon: e.icon ?? null,
    background: e.background ?? false,
  };
}

export function fromStoredEvent(r: EventRow): CalendarEvent {
  return {
    id: r.id, sourceId: r.sourceId, title: r.title as Text, start: r.start, end: r.end, allDay: r.allDay || undefined,
    memberIds: r.memberIds, location: r.location ?? undefined, icon: r.icon ?? undefined, background: r.background || undefined,
    recurring: r.recurring || undefined,
  };
}
