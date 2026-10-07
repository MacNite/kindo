// Loads the demo family (§20 D11) into an empty database.
//
//   npm run db:seed:demo               fails if a household exists
//   npm run db:seed:demo -- --if-empty  quietly does nothing then (migrate image, KINDO_DEMO=1)
import { PrismaClient } from "@prisma/client";
import { hasHousehold, seedDemo } from "../src/server/demo/seed";

const db = new PrismaClient();
const ifEmpty = process.argv.includes("--if-empty");

async function main() {
  if (await hasHousehold(db)) {
    if (ifEmpty) {
      console.log("A household exists; the demo family is not loaded.");
      return;
    }
    throw new Error("This database already has a household. The demo family only loads into an empty database.");
  }
  await db.$transaction((tx) => seedDemo(tx), { timeout: 60_000 });
  console.log("Demo family loaded.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
