// Loads the demo family (§20 D11) into an empty database.
//
//   npm run db:seed:demo               fails if a household exists
//   npm run db:seed:demo -- --if-empty  quietly does nothing then (migrate image, KINDO_DEMO=1)
//   npm run db:seed:demo -- --reset     wipes the demo family and loads it afresh (demo.yml's reset, D73);
//                                       refuses a real household
//
// With KINDO_DEMO_EMAIL and KINDO_DEMO_PASSWORD set, Anna (the demo's admin)
// gets that login, so the demo opens without first-run setup (D73).
import { PrismaClient } from "@prisma/client";
import { createDemoLogin, hasHousehold, seedDemo, wipeDemo } from "../src/server/demo/seed";

const db = new PrismaClient();
const ifEmpty = process.argv.includes("--if-empty");
const reset = process.argv.includes("--reset");
const email = process.env.KINDO_DEMO_EMAIL?.trim();
const password = process.env.KINDO_DEMO_PASSWORD;

async function main() {
  if (!reset && (await hasHousehold(db))) {
    if (ifEmpty) {
      console.log("A household exists; the demo family is not loaded.");
      return;
    }
    throw new Error("This database already has a household. The demo family only loads into an empty database.");
  }
  await db.$transaction(async (tx) => {
    if (reset) await wipeDemo(tx);
    await seedDemo(tx);
    if (email && password) await createDemoLogin(tx, email, password);
  }, { timeout: 60_000 });
  // Open screens refetch (src/server/realtime.ts); their sessions went with the wipe.
  if (reset) await db.$executeRaw`SELECT pg_notify('kindo_changes', ${JSON.stringify({ topic: "household" })})`;
  console.log(reset ? "Demo family reset." : "Demo family loaded.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
