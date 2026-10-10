"use server";
import { headers } from "next/headers";
import * as M from "../media/media";
import * as V from "../assist";
import { env } from "../env";
import { act } from "./act";

/**
 * Listening (§23) and talking to Home Assistant (§24). Everyone who sees the
 * household may listen, a wall without the PIN included, and play the shelf
 * on the admin's speakers; what is on the shelf and which speakers there are
 * is the admin's. Talking is for adults or a wall unlocked with the PIN (the
 * recording itself goes to `/api/assist`).
 */
export const mediaQueue = act(M.M.queue, async (db, input) => M.queue(db, input), { level: "view", topic: null });
export const saveMediaProgress = act(M.M.progress, async (db, input) => M.saveProgress(db, input), { level: "view", topic: null });
export const readSpeakers = act(M.M.none, async (db) => M.readSpeakers(db), { level: "view", topic: null });
export const playOnSpeaker = act(M.M.cast, async (db, input) => M.castToSpeaker(db, input, await publicBase()), { level: "tick", topic: null });
export const speakerCommand = act(M.M.speaker, async (db, input) => M.speakerCommand(db, input), { level: "tick", topic: null });

export const browseMedia = act(M.M.browse, async (db, input) => M.browse(db, input), { level: "admin", topic: null });
export const saveShelf = act(M.M.shelf, async (db, input) => M.saveShelf(db, input), { level: "admin", topic: "household" });
export const listMediaAccounts = act(M.M.byId, async (db, input) => M.listAccounts(db, input), { level: "admin", topic: null });
export const saveMediaAccount = act(M.M.account, async (db, input) => M.saveAccount(db, input), { level: "admin", topic: null });
export const listSpeakerChoices = act(M.M.byId, async (db, input) => M.listSpeakerChoices(db, input), { level: "admin", topic: null });
export const saveSpeakers = act(M.M.speakers, async (db, input) => M.saveSpeakers(db, input), { level: "admin", topic: "household" });
export const listVoicePipelines = act(V.V.byId, async (db, input) => V.voiceChoices(db, input), { level: "admin", topic: null });
export const saveVoice = act(V.V.setup, async (db, input) => V.saveVoice(db, input), { level: "admin", topic: "household" });

/**
 * The address a speaker fetches Kindo's files at: APP_URL, or the address
 * this screen opened Kindo at. A speaker must be able to reach it.
 */
async function publicBase() {
  const configured = env().APP_URL;
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
