import type { Connection, Prisma } from "@prisma/client";
import { z } from "zod";
import { inTx, type Tx } from "../db";
import { UserError, notFound } from "../errors";
import { errorMessage, log } from "../log";
import { id } from "../validation";
import { retryDelayMs } from "../jobs";
import { DavRefused } from "../dav";
import { caldavAccount, holdLifted, recordSyncFailure } from "../calendar/sync";
import { fetchBirthdays, listAddressBooks } from "./carddav";

/**
 * Contact birthdays (§12, D46). A Nextcloud connection can also read the
 * birthdays from chosen address books; the household decides who shows on
 * the birthday wheel, under which name and in whose colour. Contacts change
 * rarely, so they are read hourly, apart from the calendars.
 */
export interface ContactsConfig {
  /** Address book URLs to read. */
  books: string[];
  /** New contacts show on the wheel at once; otherwise someone ticks them. */
  autoShow: boolean;
  syncedAt?: string;
  /** The last failed read and how many failed in a row: the job backs off. */
  failedAt?: string;
  failures?: number;
}
const CONTACT_MINUTES = 60;

export const B = {
  contactBooks: z.object({ id, books: z.array(z.string().url().max(2000)).max(20), autoShow: z.boolean() }),
  contactBirthday: z.object({
    id,
    show: z.boolean().optional(),
    alias: z.string().trim().max(80).optional(),
    memberId: id.nullable().optional(),
  }),
  byId: z.object({ id }),
};
type In<K extends keyof typeof B> = z.output<(typeof B)[K]>;

const contactsConfig = (conn: Pick<Connection, "config">) => (conn.config as { contacts?: ContactsConfig } | null)?.contacts;
const withContacts = (conn: Connection, contacts: ContactsConfig) => ({ ...(conn.config as object), contacts }) as unknown as Prisma.InputJsonValue;

async function caldavConnection(db: Tx, connectionId: string) {
  const conn = await db.connection.findUnique({ where: { id: connectionId } });
  if (!conn) throw notFound("connection");
  if (conn.kind !== "caldav") throw new UserError("invalid", "address books come with a Nextcloud (CalDAV) connection");
  return conn;
}

/** The connection's address books, for the admin to pick from. */
export async function addressBooksOf(db: Tx, input: In<"byId">) {
  return listAddressBooks(caldavAccount(await caldavConnection(db, input.id)));
}

/** Reads the connection's chosen address books into ContactBirthday, keeping the household's own choices. */
export async function syncContacts(db: Tx, conn: Connection, now = new Date()) {
  const cfg = contactsConfig(conn);
  if (!cfg?.books.length) {
    await db.contactBirthday.deleteMany({ where: { connectionId: conn.id } });
    return;
  }
  let found: Map<string, Awaited<ReturnType<typeof fetchBirthdays>>[number]>;
  try {
    found = new Map((await fetchBirthdays(caldavAccount(conn), cfg.books)).map((c) => [c.uid, c]));
  } catch (e) {
    // Remembered so the job backs off instead of asking a server that is down every minute.
    const latest = await db.connection.findUnique({ where: { id: conn.id } });
    const last = latest && contactsConfig(latest);
    if (last) await db.connection.update({ where: { id: conn.id }, data: { config: withContacts(latest, { ...last, failedAt: now.toISOString(), failures: (last.failures ?? 0) + 1 }) } });
    // Refused (wrong app password, too many requests): the calendars of this account hold off too (D60).
    if (e instanceof DavRefused) await recordSyncFailure(db, conn.id, e, now);
    throw e;
  }
  await inTx(db, async (tx) => {
    const known = await tx.contactBirthday.findMany({ where: { connectionId: conn.id } });
    const gone = known.filter((k) => !found.has(k.uid)).map((k) => k.id);
    if (gone.length) await tx.contactBirthday.deleteMany({ where: { id: { in: gone } } });
    for (const c of found.values()) {
      const old = known.find((k) => k.uid === c.uid);
      if (!old) await tx.contactBirthday.create({ data: { connectionId: conn.id, uid: c.uid, name: c.name, date: c.date, show: cfg.autoShow } });
      else if (old.name !== c.name || old.date !== c.date) await tx.contactBirthday.update({ where: { id: old.id }, data: { name: c.name, date: c.date } });
    }
    const latest = await tx.connection.findUniqueOrThrow({ where: { id: conn.id } });
    await tx.connection.update({ where: { id: conn.id }, data: { config: withContacts(latest, { ...cfg, syncedAt: now.toISOString(), failedAt: undefined, failures: undefined }) } });
  });
}

/** Nextcloud connections whose contacts are due to be read again. */
export async function dueContactConnections(db: Tx, now = new Date()) {
  const all = await db.connection.findMany({ where: { kind: "caldav" } });
  return all.filter((c) => {
    const cfg = contactsConfig(c);
    if (!cfg?.books.length || !holdLifted(c, now)) return false;
    const interval = CONTACT_MINUTES * 60_000;
    if (cfg.failedAt && cfg.failures) return now.getTime() - new Date(cfg.failedAt).getTime() >= retryDelayMs(cfg.failures, interval);
    return !cfg.syncedAt || now.getTime() - new Date(cfg.syncedAt).getTime() >= interval;
  });
}

/** Which address books to read and whether new contacts show at once; reads them right away. */
export async function setContactBooks(db: Tx, input: In<"contactBooks">) {
  const conn = await caldavConnection(db, input.id);
  const updated = await db.connection.update({
    where: { id: conn.id },
    data: { config: withContacts(conn, { books: [...new Set(input.books)], autoShow: input.autoShow }) },
  });
  try {
    await syncContacts(db, updated);
  } catch (e) {
    log.warn("contact sync failed", { connection: conn.id, error: errorMessage(e) });
    throw e instanceof UserError ? e : new UserError("remote", errorMessage(e));
  }
}

/** The household's own settings for one contact: shown, the name Kindo uses, whose colour. */
export async function updateContactBirthday(db: Tx, input: In<"contactBirthday">) {
  const c = await db.contactBirthday.findUnique({ where: { id: input.id } });
  if (!c) throw notFound("contact");
  if (input.memberId && !(await db.member.findUnique({ where: { id: input.memberId } }))) throw notFound("member");
  await db.contactBirthday.update({
    where: { id: c.id },
    data: {
      show: input.show,
      alias: input.alias === undefined ? undefined : input.alias || null,
      memberId: input.memberId === undefined ? undefined : input.memberId,
    },
  });
}
