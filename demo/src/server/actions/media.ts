import type * as Real from "@/server/actions/media";
import { notInDemo } from "../demo/browser";

/** The kids' shelf needs Jellyfin or Audiobookshelf, which the static demo doesn't have (§20 D74). */
export const mediaQueue: typeof Real.mediaQueue = notInDemo;
export const mediaTracks: typeof Real.mediaTracks = notInDemo;
export const saveMediaProgress: typeof Real.saveMediaProgress = notInDemo;
export const readSpeakers: typeof Real.readSpeakers = notInDemo;
export const playOnSpeaker: typeof Real.playOnSpeaker = notInDemo;
export const speakerCommand: typeof Real.speakerCommand = notInDemo;
export const browseMedia: typeof Real.browseMedia = notInDemo;
export const saveShelf: typeof Real.saveShelf = notInDemo;
export const listMediaAccounts: typeof Real.listMediaAccounts = notInDemo;
export const saveMediaAccount: typeof Real.saveMediaAccount = notInDemo;
export const listSpeakerChoices: typeof Real.listSpeakerChoices = notInDemo;
export const saveSpeakers: typeof Real.saveSpeakers = notInDemo;
export const listVoicePipelines: typeof Real.listVoicePipelines = notInDemo;
export const setMediaPin: typeof Real.setMediaPin = notInDemo;
export const setMediaScreen: typeof Real.setMediaScreen = notInDemo;
export const saveVoice: typeof Real.saveVoice = notInDemo;
