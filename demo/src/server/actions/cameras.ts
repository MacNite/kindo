import type * as Real from "@/server/actions/cameras";
import { notInDemo } from "../demo/browser";

/** Cameras need Frigate, which the static demo doesn't have (§20 D74). */
export const activeRing: typeof Real.activeRing = notInDemo;
export const takeTalk: typeof Real.takeTalk = notInDemo;
export const releaseTalk: typeof Real.releaseTalk = notInDemo;
export const listCameraChoices: typeof Real.listCameraChoices = notInDemo;
export const saveCameraSetup: typeof Real.saveCameraSetup = notInDemo;
