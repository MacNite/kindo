import { Prisma } from "@prisma/client";

/**
 * An expected failure the user can do something about. Server actions return
 * its code instead of throwing, because production builds hide thrown messages.
 * Codes map to `errors.*` strings in the message catalogues.
 */
export type ErrorCode =
  | "notFound" | "invalid" | "forbidden" | "unauthenticated" | "conflict" | "notEnoughPoints" | "readOnly" | "remote" | "server"
  /** A wall display needs the settings PIN for this. */
  | "pin" | "noPin" | "wrongPin" | "tooManyAttempts" | "wrongLogin"
  /** Someone else is talking through this camera (§22). */
  | "busy"
  /** Not a picture Kindo takes (D61). */
  | "photo";

export class UserError extends Error {
  constructor(public code: ErrorCode, message?: string) {
    super(message ?? code);
  }
}

export const notFound = (what: string) => new UserError("notFound", `${what} not found`);

/**
 * Database failures the user caused rather than a bug: an update or delete
 * of a row that is gone (Prisma P2025, e.g. a reward another screen just
 * removed) is "not found". Anything else stays as it is.
 */
export function expectedError(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return new UserError("notFound", e.message);
  return e;
}
