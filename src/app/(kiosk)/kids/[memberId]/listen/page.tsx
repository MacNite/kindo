import { KidsListen } from "@/components/media/Media";

export default async function Page({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  return <KidsListen memberId={memberId} />;
}
