/**
 * An expected failure the user can do something about. Server actions return
 * its code instead of throwing, because production builds hide thrown messages.
 * Codes map to `errors.*` strings in the message catalogues.
 */
export type ErrorCode =
  | "notFound" | "invalid" | "forbidden" | "unauthenticated" | "conflict" | "notEnoughPoints" | "readOnly" | "remote" | "server"
  /** A wall display needs the settings PIN for this. */
  | "pin" | "noPin" | "wrongPin" | "tooManyAttempts" | "wrongLogin";

export class UserError extends Error {
  constructor(public code: ErrorCode, message?: string) {
    super(message ?? code);
  }
}

export const notFound = (what: string) => new UserError("notFound", `${what} not found`);
