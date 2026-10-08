import { createDAVClient } from "tsdav";
import { UserError } from "../errors";
import { errorMessage } from "../log";
import type { CalDavAccount } from "../calendar/caldav";
import { parseVCardBirthdays, type VCardBirthday } from "./vcard";

/**
 * Address books of a Nextcloud (or other CardDAV) account, read with the same
 * app password as its calendars (§12, D46). Read only: Kindo never changes a
 * contact.
 */
export interface AddressBook { url: string; name: string }

async function client(a: CalDavAccount) {
  try {
    return await createDAVClient({
      serverUrl: a.url,
      credentials: { username: a.username, password: a.password },
      authMethod: "Basic",
      defaultAccountType: "carddav",
    });
  } catch (e) {
    const msg = errorMessage(e);
    throw new UserError("remote", /401|unauthori[sz]ed/i.test(msg) ? "wrong username or app password" : msg);
  }
}

export async function listAddressBooks(a: CalDavAccount): Promise<AddressBook[]> {
  const c = await client(a);
  const books = await c.fetchAddressBooks();
  return books.map((b) => ({
    url: b.url,
    name: typeof b.displayName === "string" && b.displayName ? b.displayName : decodeURIComponent(b.url.replace(/\/$/, "").split("/").pop() ?? "Contacts"),
  }));
}

/** Every contact with a birthday in these address books. */
export async function fetchBirthdays(a: CalDavAccount, bookUrls: string[]): Promise<VCardBirthday[]> {
  const c = await client(a);
  const out: VCardBirthday[] = [];
  for (const url of bookUrls) {
    const cards = await c.fetchVCards({ addressBook: { url } });
    for (const card of cards) {
      if (typeof card.data !== "string") continue;
      try {
        out.push(...parseVCardBirthdays(card.data, card.url));
      } catch {
        // One broken contact must not hide the rest.
      }
    }
  }
  return out;
}
