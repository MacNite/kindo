import { ChildRoutine } from "@/components/routines/ChildRoutine";

export default async function Page({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  return <ChildRoutine memberId={memberId} />;
}
