import { KidsListen } from "@/components/media/Media";
import { demoMembers } from "@/server/demo/data";

/** A static page per demo child (§20 D74). */
export const generateStaticParams = () => demoMembers(new Date()).map((m) => ({ memberId: m.id }));

export default async function Page({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  return <KidsListen memberId={memberId} />;
}
