// Creates the suite's database (DATABASE_URL, which playwright.config.ts
// points at `<name>_e2e`) if missing, migrates it from scratch and loads the
// demo family. Runs before the server starts.
import { execSync } from "node:child_process";
import pg from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_e2e")) {
    throw new Error("prepare-db empties its database: run it through `npm run test:e2e`, which points it at <name>_e2e.");
  }
  const target = new URL(url);
  const dbName = decodeURIComponent(target.pathname.slice(1));
  const admin = new URL(url);
  admin.pathname = "/postgres";
  admin.search = "";
  const server = new pg.Client({ connectionString: admin.toString() });
  await server.connect();
  const exists = await server.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!exists.rowCount) await server.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  await server.end();

  // Empty the suite's own database and migrate it from scratch.
  const schema = target.searchParams.get("schema") ?? "public";
  const plain = new URL(url);
  plain.search = "";
  const db = new pg.Client({ connectionString: plain.toString() });
  await db.connect();
  await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.query(`CREATE SCHEMA "${schema}"`);
  await db.end();

  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed-demo.ts", { stdio: "inherit", env });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
