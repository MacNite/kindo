import { Client } from "pg";
import { errorMessage, log } from "./log";
import { notify, type Topic } from "./realtime";

/**
 * Background jobs (§19.3, §19.5–8): holiday feeds, calendar and photo sync.
 * Exactly one app instance runs them: the one holding a PostgreSQL advisory
 * lock on its own connection. If it goes away, the lock is released and
 * another instance takes over on its next tick.
 */
export interface Job {
  name: string;
  /** Is there work to do now? Cheap: called every tick. */
  due: (now: Date) => Promise<boolean>;
  run: (now: Date) => Promise<unknown>;
  /** What to tell the screens afterwards. */
  topic?: Topic;
}

const TICK_MS = 60_000;
const LOCK_KEY = 0x4b696e64; // "Kind"

interface State { started: boolean; jobs: Job[]; lock?: Client; running: Set<string>; timer?: ReturnType<typeof setInterval> }
const g = globalThis as unknown as { kindoJobs?: State };
const state: State = (g.kindoJobs ??= { started: false, jobs: [], running: new Set() });

export function registerJob(job: Job) {
  if (!state.jobs.some((j) => j.name === job.name)) state.jobs.push(job);
}

async function isLeader(): Promise<boolean> {
  if (state.lock) return true;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const r = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!r.rows[0]?.ok) {
      await client.end();
      return false;
    }
    client.on("error", () => {
      state.lock = undefined; // connection lost: the lock went with it
    });
    state.lock = client;
    log.info("this instance runs the background jobs");
    return true;
  } catch (e) {
    await client.end().catch(() => {});
    log.warn("job leadership check failed", { error: errorMessage(e) });
    return false;
  }
}

/** Runs every due job once (if this instance leads). Exported for tests and "sync now". */
export async function tick(now = new Date()) {
  if (!(await isLeader())) return;
  for (const job of state.jobs) {
    if (state.running.has(job.name)) continue;
    let due = false;
    try {
      due = await job.due(now);
    } catch (e) {
      log.warn("job check failed", { job: job.name, error: errorMessage(e) });
    }
    if (!due) continue;
    state.running.add(job.name);
    job.run(now)
      .then(() => job.topic && notify(job.topic))
      .catch((e) => log.warn("job failed", { job: job.name, error: errorMessage(e) }))
      .finally(() => state.running.delete(job.name));
  }
}

export function startJobs() {
  if (state.started || process.env.KINDO_JOBS === "off") return;
  state.started = true;
  // Wait a little after start so migrations and the first requests come first.
  setTimeout(() => void tick(), 5_000).unref?.();
  state.timer = setInterval(() => void tick(), TICK_MS);
  state.timer.unref?.();
}

/** Used by the holiday sync button etc.: whether a job is mid-run right now. */
export const isRunning = (name: string) => state.running.has(name);
