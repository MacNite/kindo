import { Client } from "pg";
import { prisma } from "./db";
import { env } from "./env";
import { errorMessage, log } from "./log";
import { notify, type Topic } from "./realtime";

/**
 * Background jobs (§19.3, §19.5–8, §20 D21): holiday feeds, calendar and
 * photo sync, Home Assistant's live subscriptions. Exactly one app instance
 * runs them: the one holding a PostgreSQL advisory lock on its own
 * connection. If it goes away, the lock is released and another instance
 * takes over on its next tick; if its connection drops, it stops what it
 * keeps running (`stop`) and competes for the lock again.
 *
 * Any instance can ask the leader to run a job now (`wakeJob`), e.g. after
 * Settings changed what a job follows: the request goes over PostgreSQL
 * NOTIFY to the lock's own connection.
 */
export interface Job {
  name: string;
  /** Is there work to do now? Cheap: called every tick. */
  due: (now: Date) => Promise<boolean>;
  run: (now: Date) => Promise<unknown>;
  /** What to tell the screens afterwards. */
  topic?: Topic;
  /** Leadership was lost: stop anything `run` keeps going (subscriptions, sockets). */
  stop?: () => void;
}

const TICK_MS = 60_000;
const LOCK_KEY = 0x4b696e64; // "Kind"
const CHANNEL = "kindo_jobs";

interface State { started: boolean; jobs: Job[]; lock?: Client; running: Set<string>; again: Set<string>; timer?: ReturnType<typeof setInterval> }
const g = globalThis as unknown as { kindoJobs?: State };
const state: State = (g.kindoJobs ??= { started: false, jobs: [], running: new Set(), again: new Set() });

export function registerJob(job: Job) {
  if (!state.jobs.some((j) => j.name === job.name)) state.jobs.push(job);
}

/** The lock's connection broke or ended: the lock went with it. */
function lostLeadership(client: Client, e?: unknown) {
  if (state.lock !== client) return;
  state.lock = undefined;
  client.removeAllListeners();
  client.on("error", () => {}); // a late error on a dead connection must not crash the process
  client.end().catch(() => {});
  log.warn("this instance no longer runs the background jobs", e ? { error: errorMessage(e) } : undefined);
  for (const job of state.jobs) {
    try {
      job.stop?.();
    } catch (err) {
      log.warn("job stop failed", { job: job.name, error: errorMessage(err) });
    }
  }
}

async function isLeader(): Promise<boolean> {
  if (state.lock) return true;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  // Before connecting: an 'error' without a listener would take the process down.
  client.on("error", (e) => lostLeadership(client, e));
  client.on("end", () => lostLeadership(client));
  try {
    await client.connect();
    const r = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!r.rows[0]?.ok) {
      client.removeAllListeners();
      await client.end();
      return false;
    }
    client.on("notification", (msg) => {
      const job = msg.channel === CHANNEL ? state.jobs.find((j) => j.name === msg.payload) : undefined;
      if (job && state.lock === client) start(job, new Date());
    });
    await client.query(`LISTEN ${CHANNEL}`);
    state.lock = client;
    log.info("this instance runs the background jobs");
    return true;
  } catch (e) {
    client.removeAllListeners();
    client.on("error", () => {});
    await client.end().catch(() => {});
    log.warn("job leadership check failed", { error: errorMessage(e) });
    return false;
  }
}

/** Runs a job unless it is mid-run; a wake-up during a run runs it once more afterwards. */
function start(job: Job, now: Date, woken = true) {
  if (state.running.has(job.name)) {
    if (woken) state.again.add(job.name);
    return;
  }
  state.running.add(job.name);
  job.run(now)
    .then(() => job.topic && notify(job.topic))
    .catch((e) => log.warn("job failed", { job: job.name, error: errorMessage(e) }))
    .finally(() => {
      state.running.delete(job.name);
      if (state.again.delete(job.name) && state.lock) start(job, new Date(), false);
    });
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
    if (due) start(job, now, false);
  }
}

/**
 * Asks whichever instance runs the jobs to run this one now. Fire and
 * forget: if the message is lost, the job's next tick catches up.
 */
export async function wakeJob(name: string) {
  try {
    await prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${name})`;
  } catch (e) {
    log.warn("job wake-up failed", { job: name, error: errorMessage(e) });
  }
}

/**
 * How long to wait after `failures` failed attempts in a row: 2, 4, 8 …
 * minutes, never longer than the job's normal interval. A source that is
 * down isn't asked every minute, and one that comes back is soon read again.
 */
export const retryDelayMs = (failures: number, intervalMs: number) => Math.min(intervalMs, TICK_MS * 2 ** Math.min(Math.max(1, failures), 20));

export function startJobs() {
  if (state.started || !env().jobs) return;
  state.started = true;
  // Wait a little after start so migrations and the first requests come first.
  setTimeout(() => void tick(), 5_000).unref?.();
  state.timer = setInterval(() => void tick(), TICK_MS);
  state.timer.unref?.();
}
