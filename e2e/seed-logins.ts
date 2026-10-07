// Logins for the demo family in the suite's own database (see prepare-db.ts).
import { PrismaClient } from "@prisma/client";
import { createLogin, setPin } from "../src/server/accounts";
import { E2E_LOGINS, E2E_PIN } from "./logins";

const db = new PrismaClient();
async function main() {
  for (const l of E2E_LOGINS) await createLogin(db, l);
  await setPin(db, { pin: E2E_PIN });
}
main().finally(() => db.$disconnect());
