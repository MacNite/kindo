import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { getActor } from "@/server/actor";
import { setupState } from "@/server/setup";

export const dynamic = "force-dynamic";

/** Only same-site paths, so the sign-in page can't be used to bounce people elsewhere. */
const safeNext = (next: string | undefined) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if ((await setupState(prisma)) !== "done") redirect("/setup");
  const { next, error } = await searchParams;
  if (await getActor()) redirect(safeNext(next));
  return <LoginScreen next={safeNext(next)} oidc={env().oidc ? env().OIDC_NAME : null} error={error ? "sso" : null} />;
}
