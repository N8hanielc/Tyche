import { NextResponse } from "next/server";

/**
 * Hardening for /admin. Authorization itself happens in the database: every admin_*
 * function checks the caller's role (supabase/admin.sql). These headers keep the panel
 * out of search engines, out of iframes (clickjacking) and out of shared caches.
 */
export function middleware() {
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "same-origin");
  return res;
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
