import { prisma } from "@/server/db";
import { getActor } from "@/server/actor";
import { openCover } from "@/server/media/media";
import { mediaResponse } from "@/server/media/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A shelf item's cover (§23), proxied like Immich photos: the server and its token stay on the server. */
export async function GET(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  if (!(await getActor())) return new Response("unauthenticated", { status: 401 });
  const { itemId } = await params;
  if (!/^[a-z0-9]{6,24}$/.test(itemId)) return new Response("invalid", { status: 400 });
  return mediaResponse(() => openCover(prisma, itemId, req.signal), { what: "cover", itemId, cache: "private, max-age=86400", image: true });
}
