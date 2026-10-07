import { redirect } from "next/navigation";
import { SetupScreen } from "@/components/setup/SetupScreen";
import { prisma } from "@/server/db";
import { hasHousehold } from "@/server/demo/seed";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await hasHousehold(prisma)) redirect("/");
  return <SetupScreen />;
}
