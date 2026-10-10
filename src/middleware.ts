import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { AUTH_COOKIE_PREFIX, DEVICE_COOKIE } from "./server/cookie-names";

/**
 * Everything is behind a login or a paired device (§19.4, §20 D24). This only
 * checks that some session or device cookie is present, which is cheap and
 * runs on the edge; the layouts and every Server Action check for real.
 * A speaker can't sign in: its signed address is its permission (D61).
 */
const PUBLIC = ["/login", "/setup", "/pair", "/api/auth", "/api/health", "/api/media/cast", "/manifest.webmanifest", "/sw.js", "/offline"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const signedIn = getSessionCookie(req, { cookiePrefix: AUTH_COOKIE_PREFIX }) || req.cookies.has(DEVICE_COOKIE);
  if (signedIn) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Pages and APIs; not Next's assets or files with an extension (icons, images).
  matcher: ["/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
