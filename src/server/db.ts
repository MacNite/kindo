import { PrismaClient } from "@prisma/client";

/** One client per process. Kept on globalThis so dev-server reloads don't open a pool each time. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "production" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** A client or an interactive transaction: what the service functions accept. */
export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/** Runs `fn` in a transaction when given the root client; inside one already, just runs it. */
export async function inTx<T>(db: Tx, fn: (tx: Tx) => Promise<T>, timeout = 15_000): Promise<T> {
  return "$transaction" in db ? (db as PrismaClient).$transaction((tx) => fn(tx), { timeout }) : fn(db);
}
