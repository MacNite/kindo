import { env } from "./server/env";
import { registerAllJobs } from "./server/register-jobs";
import { startJobs } from "./server/jobs";

// Refuse to start with a broken configuration (e.g. no KINDO_SECRET_KEY in
// production) instead of failing at the first sign-in.
try {
  env();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

registerAllJobs();
startJobs();
