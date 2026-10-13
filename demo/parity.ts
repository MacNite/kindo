/**
 * Every Server Action has a demo twin (§20 D74). Each twin is typed as
 * `typeof` the real one; this adds that none is missing or left over, so
 * `npm run typecheck` fails until a new action is in `demo/src` too.
 */
import type * as Accounts from "@/server/actions/accounts";
import type * as Birthdays from "@/server/actions/birthdays";
import type * as Cameras from "@/server/actions/cameras";
import type * as Home from "@/server/actions/home";
import type * as Household from "@/server/actions/household";
import type * as Integrations from "@/server/actions/integrations";
import type * as Media from "@/server/actions/media";
import type * as Setup from "@/server/actions/setup";
import type * as DemoAccounts from "./src/server/actions/accounts";
import type * as DemoBirthdays from "./src/server/actions/birthdays";
import type * as DemoCameras from "./src/server/actions/cameras";
import type * as DemoHome from "./src/server/actions/home";
import type * as DemoHousehold from "./src/server/actions/household";
import type * as DemoIntegrations from "./src/server/actions/integrations";
import type * as DemoMedia from "./src/server/actions/media";
import type * as DemoSetup from "./src/server/actions/setup";

type Missing<Real, Demo> = Exclude<keyof Real, keyof Demo>;
type Extra<Real, Demo> = Exclude<keyof Demo, keyof Real>;
/** `never` when both modules export the same names; otherwise the names that differ, and an error below. */
type Diff<Real, Demo> = Missing<Real, Demo> | Extra<Real, Demo>;

export type DemoParity = [
  Diff<typeof Accounts, typeof DemoAccounts>,
  Diff<typeof Birthdays, typeof DemoBirthdays>,
  Diff<typeof Cameras, typeof DemoCameras>,
  Diff<typeof Home, typeof DemoHome>,
  Diff<typeof Household, typeof DemoHousehold>,
  Diff<typeof Integrations, typeof DemoIntegrations>,
  Diff<typeof Media, typeof DemoMedia>,
  Diff<typeof Setup, typeof DemoSetup>,
] extends never[] ? true : false;
export const demoParity: DemoParity = true;
