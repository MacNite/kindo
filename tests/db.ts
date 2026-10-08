import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import type { Viewer } from "@/lib/types";

/**
 * Integration tests run against TEST_DATABASE_URL, a disposable database that
 * is emptied at the start of each file. Without it they are skipped, so
 * `npm test` still works on a machine with no PostgreSQL.
 */
try {
  process.loadEnvFile?.(".env");
} catch {}
export const TEST_DB = process.env.TEST_DATABASE_URL;

/**
 * `resetTestDatabase` drops the whole schema, so it refuses a database that
 * looks real: the one in DATABASE_URL, or one without "test" in its name.
 * `KINDO_TEST_DB_FORCE=1` overrides.
 */
export function assertDisposable(url: string, mains = mainDatabaseUrls()) {
  if (process.env.KINDO_TEST_DB_FORCE === "1") return;
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (mains.some((main) => sameDatabase(url, main))) {
    throw new Error("TEST_DATABASE_URL points at DATABASE_URL; the tests would empty it. Use a separate database (or KINDO_TEST_DB_FORCE=1).");
  }
  if (!/test/i.test(name)) {
    throw new Error(`TEST_DATABASE_URL's database "${name}" has no "test" in its name; the tests would empty it. Rename it (or KINDO_TEST_DB_FORCE=1).`);
  }
}

/**
 * DATABASE_URL from the environment and from .env: vitest.config.ts sets a
 * placeholder first, so loading .env above never overrides it.
 */
function mainDatabaseUrls() {
  const urls = [process.env.DATABASE_URL];
  try {
    urls.push(parseEnv(readFileSync(".env", "utf8")).DATABASE_URL);
  } catch {}
  return urls.filter((u): u is string => Boolean(u));
}

function sameDatabase(a: string, b: string) {
  const key = (s: string) => {
    const u = new URL(s);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.slice(1)}?${u.searchParams.get("schema") ?? "public"}`;
  };
  try {
    return key(a) === key(b);
  } catch {
    return a === b;
  }
}

export async function resetTestDatabase() {
  assertDisposable(TEST_DB!);
  const db = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
  const schema = new URL(TEST_DB!).searchParams.get("schema") ?? "public";
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: TEST_DB } });
  return db;
}

/** An admin looking at the household, for snapshot tests. */
export const VIEWER: Viewer = { kind: "user", name: "Anna", memberId: "anna", role: "admin", canManage: true, isAdmin: true, pinSet: false };
