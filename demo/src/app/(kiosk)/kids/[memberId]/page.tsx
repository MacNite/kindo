import { ChildRoutine } from "@/components/routines/ChildRoutine";
import { demoMembers } from "@/server/demo/data";

/** A static page per demo child (§20 D74). Children added in the demo have none: a static site knows its pages in advance. */
export const generateStaticParams = () => demoMembers(new Date()).map((m) => ({ memberId: m.id }));

export default async function Page({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  return <ChildRoutine memberId={memberId} />;
}
