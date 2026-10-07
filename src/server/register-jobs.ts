import { prisma } from "./db";
import { registerJob } from "./jobs";
import { holidaysDue, syncHolidays } from "./holidays";

/** Every background job Kindo runs, in one place. */
export function registerAllJobs() {
  registerJob({ name: "holidays", due: (now) => holidaysDue(prisma, now), run: (now) => syncHolidays(prisma, now), topic: "household" });
}
