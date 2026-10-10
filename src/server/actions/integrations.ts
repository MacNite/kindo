"use server";
import * as C from "../connections";
import * as K from "../cameras";
import * as M from "../media/media";
import { notify } from "../realtime";
import { act } from "./act";

/** Integrations (§15, §19.5–8): admin only; secrets go in, never come out. */
export const addCalDav = act(C.C.addCalDav, async (db, input) => {
  const id = await C.addCalDav(db, input);
  // First sync right away, so the calendars show up while the admin is still looking.
  await C.syncNow(db, { id }).catch(() => {});
  return id;
}, { level: "admin", topic: "events" });
export const addIcs = act(C.C.addIcs, async (db, input) => C.addIcs(db, input), { level: "admin", topic: "events" });
export const addHomeAssistant = act(C.C.addHomeAssistant, async (db, input) => C.addHomeAssistant(db, input), { level: "admin", topic: "household" });
export const addFrigate = act(K.K.addFrigate, async (db, input) => K.addFrigate(db, input), { level: "admin", topic: "household" });
export const addJellyfin = act(M.M.addJellyfin, async (db, input) => M.addJellyfin(db, input), { level: "admin", topic: "household" });
export const startJellyfinQuickConnect = act(M.M.quickConnectStart, async (_db, input) => M.quickConnectStart(input), { level: "admin", topic: null });
// Checked every few seconds while the admin enters the code: only a sign-in is news for the other screens.
export const checkJellyfinQuickConnect = act(M.M.quickConnect, async (db, input) => {
  const r = await M.quickConnect(db, input);
  if (r.done) await notify("household");
  return r;
}, { level: "admin", topic: null });
export const addAudiobookshelf = act(M.M.addAudiobookshelf, async (db, input) => M.addAudiobookshelf(db, input), { level: "admin", topic: "household" });
export const updateConnection = act(C.C.update, C.updateConnection, { level: "admin", topic: "household" });
export const addImmich = act(C.C.addImmich, async (db, input) => C.addImmich(db, input), { level: "admin", topic: "household" });
export const updateSource = act(C.C.source, C.updateSource, { level: "admin", topic: "events" });
export const removeSource = act(C.C.byId, C.removeSource, { level: "admin", topic: "events" });
export const removeConnection = act(C.C.byId, C.removeConnection, { level: "admin", topic: "household" });
export const syncConnectionNow = act(C.C.byId, C.syncNow, { level: "admin", topic: "household" });
