import { NextResponse, type NextRequest } from "next/server";

/**
 * One URL per page: `/Edit-PDF` would otherwise be a duplicate of `/edit-pdf`
 * on case-insensitive hosts, and `/edit-pdf/` of `/edit-pdf` (Next's own
 * trailing-slash redirect is off for the PostHog proxy). Permanently redirect both.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const canonical = (pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname).toLowerCase();
  if (pathname === canonical) return NextResponse.next();
  // A plain URL: NextURL would re-append the trailing slash it was parsed with.
  return NextResponse.redirect(new URL(canonical + req.nextUrl.search, req.url), 308);
}

export const config = {
  // Pages only: skip API, the analytics proxy, Next internals and files with an extension.
  matcher: ["/((?!api/|ingest/|_next/|.*\\.[^/]+$).*)"],
};
