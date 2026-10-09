import { prisma } from "@/server/db";
import { getActor } from "@/server/actor";
import { UserError } from "@/server/errors";
import { errorMessage, log } from "@/server/log";
import { getPhoto } from "@/server/photos/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Immich photos, proxied (§13, §19.6): the API key stays on the server, the image is cached on disk. */
export async function GET(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  if (!(await getActor())) return new Response("unauthenticated", { status: 401 });
  const { assetId } = await params;
  const size = new URL(req.url).searchParams.get("size") === "thumbnail" ? "thumbnail" : "preview";
  try {
    const img = await getPhoto(prisma, assetId, size);
    return new Response(new Uint8Array(img.body), {
      headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=604800", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    const status = e instanceof UserError && e.code === "notFound" ? 404 : 502;
    log.warn("photo proxy failed", { asset: assetId, size, status, error: errorMessage(e) });
    // The detail (addresses, Immich's own words) is in the log; screens only get the code.
    return new Response(status === 404 ? "notFound" : "remote", { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
}
