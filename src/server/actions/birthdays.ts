"use server";
import * as B from "../contacts/sync";
import { act } from "./act";

/** Contact birthdays for the birthday wheel (§12, D46): admin only, like the connection they come from. */
export const listAddressBooks = act(B.B.byId, B.addressBooksOf, { level: "admin", topic: null });
export const setContactBooks = act(B.B.contactBooks, B.setContactBooks, { level: "admin" });
export const updateContactBirthday = act(B.B.contactBirthday, B.updateContactBirthday, { level: "admin" });
