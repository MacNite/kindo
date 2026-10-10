import { prisma } from "@/server/db";
import { can, getActor } from "@/server/actor";
import { contactPhoto } from "@/server/contacts/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A contact's picture on the birthday wheel (D61). Its address changes with every upload, so it may be cached long. */
export async function GET(_req: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response("unauthenticated", { status: 401 });
  const { contactId } = await params;
  try {
    const img = await contactPhoto(prisma, contactId, can(actor, "admin"));
    return new Response(new Uint8Array(img.body), {
      headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("notFound", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
}
