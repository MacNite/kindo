/**
 * Cookie names shared by the sign-in code and the Edge middleware. Kept in a
 * module of its own so the middleware can read them without pulling in
 * Better Auth or Prisma.
 */
export const AUTH_COOKIE_PREFIX = "kindo";
/** A paired wall display's token (§19.4). */
export const DEVICE_COOKIE = "kindo_device";
