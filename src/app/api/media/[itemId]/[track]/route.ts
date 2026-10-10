import { prisma } from "@/server/db";
import { getActor } from "@/server/actor";
import { openTrack } from "@/server/media/media";
import { mediaResponse } from "@/server/media/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One file of a shelf item for the screen's own player (§23): Jellyfin's or
 * Audiobookshelf's sound through Kindo, so the browser never learns the
 * server or its token. The player's Range goes on, so it can seek.
 */
export async function GET(req: Request, { params }: { params: Promise<{ itemId: string; track: string }> }) {
  if (!(await getActor())) return new Response("unauthenticated", { status: 401 });
  const { itemId, track } = await params;
  const index = Number(track);
  if (!/^[a-z0-9]{6,24}$/.test(itemId) || !Number.isInteger(index) || index < 0 || index > 9999) return new Response("invalid", { status: 400 });
  return mediaResponse(() => openTrack(prisma, itemId, index, req.headers.get("range"), req.signal), { what: "track", itemId, cache: "private, no-store" });
}
