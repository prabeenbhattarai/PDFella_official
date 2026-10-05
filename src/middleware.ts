import { NextResponse, type NextRequest } from "next/server";

/**
 * One URL per page: `/Edit-PDF` would otherwise be a duplicate of `/edit-pdf`
 * on case-insensitive hosts. Permanently redirect any uppercase path.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === pathname.toLowerCase()) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = pathname.toLowerCase();
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Pages only: skip API, Next internals and files with an extension.
  matcher: ["/((?!api/|_next/|.*\\.[^/]+$).*)"],
};
