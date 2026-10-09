import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { TEST_DB, resetTestDatabase } from "./db";

/** The job leader (§20 D21): one instance holds the lock, others ask it to run a job, and losing the lock stops what it keeps running. */
describe.skipIf(!TEST_DB)("background jobs", () => {
  let db: PrismaClient;
  let jobs: typeof import("@/server/jobs");
  const runs: string[] = [];
  let stops = 0;

  beforeAll(async () => {
    db = await resetTestDatabase();
    // The lock's connection and the wake-up both use the app's database.
    vi.stubEnv("DATABASE_URL", TEST_DB!);
    jobs = await import("@/server/jobs");
    jobs.registerJob({ name: "test-watch", due: async () => runs.length === 0, run: async () => void runs.push("run"), stop: () => void stops++ });
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    await db?.$disconnect();
  });

  const lockHolders = async () => (await db.$queryRaw<{ pid: number }[]>`SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND objid = ${0x4b696e64}
    AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`).map((r) => r.pid);

  it("takes the lock and runs due jobs", async () => {
    await jobs.tick();
    await expect.poll(() => runs).toEqual(["run"]);
    expect(await lockHolders()).toHaveLength(1);
  });

  it("runs a job at once when another instance asks for it", async () => {
    await jobs.wakeJob("test-watch");
    await expect.poll(() => runs.length).toBe(2);
  });

  it("stops what the job keeps running when the lock's connection goes away, and leads again later", async () => {
    const [pid] = await lockHolders();
    const admin = new Client({ connectionString: TEST_DB });
    await admin.connect();
    try {
      await admin.query("SELECT pg_terminate_backend($1)", [pid]);
    } finally {
      await admin.end();
    }
    await expect.poll(() => stops).toBe(1);
    await jobs.tick();
    await expect.poll(lockHolders).toHaveLength(1);
  });
});
