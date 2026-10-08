"use server";
import * as K from "../cameras";
import { activeRing as readActiveRing } from "../doorbell";
import { act } from "./act";

/**
 * Cameras and the doorbell (§22): every screen may watch and see a ring;
 * talking is for adults or a wall unlocked with the PIN; choosing cameras is
 * the admin's. The WebRTC handshake itself is a route (`/api/cameras/<id>/webrtc`),
 * so a slow camera never holds up the screen's other actions.
 */
export const activeRing = act(K.K.none, async (db) => readActiveRing(db), { level: "view", topic: null });
export const takeTalk = act(K.K.talk, K.takeTalk, { level: "manage", topic: null });
export const releaseTalk = act(K.K.talk, K.releaseTalk, { level: "view", topic: null });
export const listCameraChoices = act(K.K.byId, K.listChoices, { level: "admin", topic: null });
export const saveCameraSetup = act(K.K.setup, K.saveSetup, { level: "admin", topic: "household" });
