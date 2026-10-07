import { redirect } from "next/navigation";
import { PairScreen } from "@/components/auth/PairScreen";
import { prisma } from "@/server/db";
import { getActor } from "@/server/actor";
import { setupState } from "@/server/setup";

export const dynamic = "force-dynamic";

export default async function Page() {
  if ((await setupState(prisma)) !== "done") redirect("/setup");
  if ((await getActor())?.kind === "device") redirect("/wall");
  return <PairScreen />;
}
