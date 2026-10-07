import { execSync } from "node:child_process";
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

export async function resetTestDatabase() {
  const db = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
  const schema = new URL(TEST_DB!).searchParams.get("schema") ?? "public";
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: TEST_DB } });
  return db;
}

/** An admin looking at the household, for snapshot tests. */
export const VIEWER: Viewer = { kind: "user", name: "Anna", memberId: "anna", role: "admin", canManage: true, isAdmin: true, pinSet: false };
