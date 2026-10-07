import { ChildRoutine } from "@/components/routines/ChildRoutine";
import { MEMBERS } from "@/lib/data/members";

export function generateStaticParams() {
  return MEMBERS.filter((m) => m.role === "child").map((m) => ({ memberId: m.id }));
}

export default async function Page({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  return <ChildRoutine memberId={memberId} />;
}
