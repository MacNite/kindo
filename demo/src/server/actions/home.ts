import type * as Real from "@/server/actions/home";
import { notInDemo } from "../demo/browser";

/** Home control needs Home Assistant, which the static demo doesn't have (§20 D74). */
export const readHome: typeof Real.readHome = notInDemo;
export const setSwitch: typeof Real.setSwitch = notInDemo;
export const allOff: typeof Real.allOff = notInDemo;
export const listHaChoices: typeof Real.listHaChoices = notInDemo;
export const saveHomeSetup: typeof Real.saveHomeSetup = notInDemo;
