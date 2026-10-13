import type * as Real from "@/server/actions/integrations";
import { notInDemo } from "../demo/browser";

/** Integrations reach the household's own servers, so the static demo can't add them (§20 D74). */
export const addCalDav: typeof Real.addCalDav = notInDemo;
export const addIcs: typeof Real.addIcs = notInDemo;
export const addHomeAssistant: typeof Real.addHomeAssistant = notInDemo;
export const addFrigate: typeof Real.addFrigate = notInDemo;
export const addJellyfin: typeof Real.addJellyfin = notInDemo;
export const startJellyfinQuickConnect: typeof Real.startJellyfinQuickConnect = notInDemo;
export const checkJellyfinQuickConnect: typeof Real.checkJellyfinQuickConnect = notInDemo;
export const addAudiobookshelf: typeof Real.addAudiobookshelf = notInDemo;
export const updateConnection: typeof Real.updateConnection = notInDemo;
export const addImmich: typeof Real.addImmich = notInDemo;
export const updateSource: typeof Real.updateSource = notInDemo;
export const removeSource: typeof Real.removeSource = notInDemo;
export const removeConnection: typeof Real.removeConnection = notInDemo;
export const syncConnectionNow: typeof Real.syncConnectionNow = notInDemo;
