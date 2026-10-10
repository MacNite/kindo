import { prisma } from "@/server/db";
import { openCast } from "@/server/media/media";
import { mediaResponse } from "@/server/media/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One file for a speaker (§23, §20 D61). A speaker can't sign in, so the
 * address itself is the permission: signed by Kindo, for one file of one
 * shelf item, valid for a few hours.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_.-]{10,300}$/.test(token)) return new Response("invalid", { status: 400 });
  return mediaResponse(() => openCast(prisma, token, req.headers.get("range"), req.signal), { what: "cast", cache: "no-store" });
}
