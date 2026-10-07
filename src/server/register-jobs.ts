import { prisma } from "./db";
import { registerJob } from "./jobs";
import { holidaysDue, syncHolidays } from "./holidays";
import { dueConnections, syncConnection } from "./calendar/sync";
import { duePhotoConnections, syncPhotos } from "./photos/sync";
import { syncPresenceWatchers } from "./homeassistant";
import { errorMessage, log } from "./log";

/** Every background job Kindo runs, in one place. */
export function registerAllJobs() {
  registerJob({ name: "holidays", due: (now) => holidaysDue(prisma, now), run: (now) => syncHolidays(prisma, now), topic: "household" });
  // Every few minutes (KINDO_SYNC_MINUTES): Nextcloud, ICS subscriptions, Google (§19.5, §19.8).
  registerJob({
    name: "calendars",
    due: async (now) => (await dueConnections(prisma, now)).length > 0,
    run: async (now) => {
      for (const c of await dueConnections(prisma, now)) {
        await syncConnection(prisma, c, { now }).catch((e) => log.warn("calendar connection skipped", { id: c.id, error: errorMessage(e) }));
      }
    },
    topic: "events",
  });
  // Every half hour: Immich albums and their photo lists (§19.6).
  registerJob({
    name: "photos",
    due: async (now) => (await duePhotoConnections(prisma, now)).length > 0,
    run: async (now) => {
      for (const c of await duePhotoConnections(prisma, now)) {
        await syncPhotos(prisma, c, now).catch((e) => log.warn("photo server skipped", { id: c.id, error: errorMessage(e) }));
      }
    },
    topic: "household",
  });
  // Home Assistant presence: keeps one live subscription per connection (§19.8).
  registerJob({ name: "presence", due: async () => true, run: () => syncPresenceWatchers(prisma) });
}
