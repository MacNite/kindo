import { RING_DEBOUNCE_MS, RING_MS, type Ring } from "@/lib/cameras";
import type { Tx } from "./db";
import { frigateCameras } from "./frigate";
import { log } from "./log";
import { notify } from "./realtime";

/**
 * Doorbell rings (§22, §20 D48). Home Assistant's visitor sensor going from
 * off to on is one press: it is stored, so a screen that reconnects or wakes
 * up still finds it, and announced as a `doorbell` topic that carries no data.
 * Each screen then asks for the ring itself.
 */

const frigateConnection = (db: Tx) => db.connection.findFirst({ where: { kind: "frigate" }, orderBy: { createdAt: "desc" } });

/** Rings older than this are pruned when the next one comes. */
const KEEP_MS = 7 * 24 * 3600_000;

/** A press of the button behind `visitorEntity`. Returns the cameras that rang. */
export async function ringFor(db: Tx, visitorEntity: string, now = new Date()): Promise<string[]> {
  const cameras = frigateCameras(await frigateConnection(db)).filter((c) => c.visitorEntity === visitorEntity);
  const rang: string[] = [];
  for (const c of cameras) {
    const recent = await db.doorbellRing.findFirst({ where: { cameraId: c.id, at: { gt: new Date(now.getTime() - RING_DEBOUNCE_MS) } } });
    if (recent) continue;
    await db.doorbellRing.create({ data: { cameraId: c.id, at: now, endsAt: new Date(now.getTime() + RING_MS) } });
    rang.push(c.id);
  }
  if (rang.length) {
    log.info("doorbell", { cameras: rang });
    await db.doorbellRing.deleteMany({ where: { endsAt: { lt: new Date(now.getTime() - KEEP_MS) } } });
    await notify("doorbell");
  }
  return rang;
}

/** The newest ring that is still going on, for a camera the household still has. */
export async function activeRing(db: Tx, now = new Date()): Promise<Ring | null> {
  const ids = frigateCameras(await frigateConnection(db)).map((c) => c.id);
  if (!ids.length) return null;
  const r = await db.doorbellRing.findFirst({ where: { cameraId: { in: ids }, endsAt: { gt: now } }, orderBy: { at: "desc" } });
  return r && { id: r.id, cameraId: r.cameraId, at: r.at, endsAt: r.endsAt };
}
