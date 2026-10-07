// Fails when prisma/schema.prisma and the committed migrations disagree, i.e.
// when a schema change was made without a migration (CLAUDE.md "Rules").
//
// `migrate diff --from-migrations` replays every migration into a shadow
// database, so SHADOW_DATABASE_URL must point at an empty database the user
// may create and drop tables in. CI uses a second database on the same server.
import { spawnSync } from "node:child_process";

const shadow = process.env.SHADOW_DATABASE_URL;
if (!shadow) {
  console.error("SHADOW_DATABASE_URL is not set. Point it at an empty, disposable PostgreSQL database.");
  process.exit(2);
}

const result = spawnSync(
  "npx",
  [
    "prisma",
    "migrate",
    "diff",
    "--from-migrations",
    "prisma/migrations",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--shadow-database-url",
    shadow,
    "--exit-code",
  ],
  { stdio: "inherit" },
);

// --exit-code: 0 = no difference, 2 = difference, 1 = error.
if (result.status === 0) {
  console.log("Schema and migrations are in sync.");
  process.exit(0);
}
if (result.status === 2) {
  console.error("Drift: prisma/schema.prisma differs from the committed migrations. Create a migration with `npm run db:migrate:dev`.");
}
process.exit(result.status ?? 1);
