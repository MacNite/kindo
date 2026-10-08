import { redirect } from "next/navigation";
import { SetupScreen } from "@/components/setup/SetupScreen";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { setupState } from "@/server/setup";

export const dynamic = "force-dynamic";

export default async function Page() {
  const state = await setupState(prisma);
  if (state === "done") redirect("/");
  return <SetupScreen claim={state === "claim"} sso={env().passwordLogin ? null : env().OIDC_NAME} />;
}
