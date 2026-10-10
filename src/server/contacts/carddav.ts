import { withDav } from "../dav";
import type { CalDavAccount } from "../calendar/caldav";
import { parseVCardBirthdays, type VCardBirthday } from "./vcard";

/**
 * Address books of a Nextcloud (or other CardDAV) account, read with the same
 * app password as its calendars (§12, D46). Read only: Kindo never changes a
 * contact.
 */
export interface AddressBook { url: string; name: string }

export async function listAddressBooks(a: CalDavAccount): Promise<AddressBook[]> {
  const books = await withDav(a, "carddav", (c) => c.fetchAddressBooks());
  return books.map((b) => ({
    url: b.url,
    name: typeof b.displayName === "string" && b.displayName ? b.displayName : decodeURIComponent(b.url.replace(/\/$/, "").split("/").pop() ?? "Contacts"),
  }));
}

/** Every contact with a birthday in these address books. */
export async function fetchBirthdays(a: CalDavAccount, bookUrls: string[]): Promise<VCardBirthday[]> {
  const out: VCardBirthday[] = [];
  for (const url of bookUrls) {
    const cards = await withDav(a, "carddav", (c) => c.fetchVCards({ addressBook: { url } }));
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
