"use server";
import * as H from "../home";
import { act } from "./act";

/**
 * Home control (§21): anyone who may tick things off may switch the lights
 * the admin picked (D44); choosing them is the admin's.
 */
export const readHome = act(H.H.none, async (db) => H.readHome(db), { level: "view", topic: null });
export const setSwitch = act(H.H.switch, H.setSwitch, { level: "tick", topic: "home" });
export const allOff = act(H.H.none, async (db) => H.allOff(db), { level: "tick", topic: "home" });
export const listHaChoices = act(H.H.byId, H.listChoices, { level: "admin", topic: null });
export const saveHomeSetup = act(H.H.setup, H.saveSetup, { level: "admin", topic: "household" });
