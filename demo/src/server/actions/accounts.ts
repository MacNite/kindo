import { z } from "zod";
import type * as Real from "@/server/actions/accounts";
import { act, notInDemo } from "../demo/browser";

/**
 * Accounts in the static demo (§20 D74): Anna is always signed in, and
 * logins, devices and pairing need a server, so they say so. The settings
 * PIN is kept, so a wall's "needs the PIN" can be tried.
 */
export const signIn: typeof Real.signIn = async () => ({ ok: true, data: undefined });
export const signOut: typeof Real.signOut = async () => ({ ok: true, data: undefined });
export const getLoginOptions: typeof Real.getLoginOptions = async () => ({ ok: true, data: { oidc: null, passwordLogin: true } });
export const getAccountAdmin: typeof Real.getAccountAdmin = async () => ({ ok: true, data: { oidc: null, passwordLogin: true, devices: [] } });

export const changePassword: typeof Real.changePassword = notInDemo;
export const createLogin: typeof Real.createLogin = notInDemo;
export const setLoginPassword: typeof Real.setLoginPassword = notInDemo;
export const removeLogin: typeof Real.removeLogin = notInDemo;
export const startPairing: typeof Real.startPairing = notInDemo;
export const pollPairing: typeof Real.pollPairing = notInDemo;
export const approvePairing: typeof Real.approvePairing = notInDemo;
export const revokeDevice: typeof Real.revokeDevice = notInDemo;
export const renameDevice: typeof Real.renameDevice = notInDemo;

export const setPin: typeof Real.setPin = act(z.object({ pin: z.string().regex(/^\d{4,8}$/).nullable() }), (s, input) => {
  s.pin = input.pin;
});
/** The demo is always Anna, never a paired wall, so there is nothing to unlock. */
export const unlockWithPin: typeof Real.unlockWithPin = async () => ({ ok: false, error: "forbidden" });
export const lockAgain: typeof Real.lockAgain = async () => ({ ok: true, data: undefined });
