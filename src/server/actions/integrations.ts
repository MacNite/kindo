"use server";
import * as C from "../connections";
import { act } from "./act";

/** Integrations (§15, §19.5–8): admin only; secrets go in, never come out. */
export const addCalDav = act(C.C.addCalDav, async (db, input) => {
  const id = await C.addCalDav(db, input);
  // First sync right away, so the calendars show up while the admin is still looking.
  await C.syncNow(db, { id }).catch(() => {});
  return id;
}, { level: "admin", topic: "events" });
export const updateSource = act(C.C.source, C.updateSource, { level: "admin", topic: "events" });
export const removeSource = act(C.C.byId, C.removeSource, { level: "admin", topic: "events" });
export const removeConnection = act(C.C.byId, C.removeConnection, { level: "admin", topic: "events" });
export const syncConnectionNow = act(C.C.byId, C.syncNow, { level: "admin", topic: "events" });
