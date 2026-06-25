/**
 * Auth proxy (Next 16 file convention; replaces the deprecated middleware.ts)
 * — NextAuth v5.
 *
 * Behaviour controlled by AUTH_ENABLED env var:
 *   - unset / false  → proxy does nothing; site is open (current state).
 *   - true           → every dashboard route AND every /api/* route except
 *                       /api/auth/*, the public icon/manifest routes, and
 *                       the cron + webhook endpoints is gated; unauth'd
 *                       requests get a redirect to /signin (HTML) or 401
 *                       (API).
 *
 * Public-from-cron routes:
 *   - /api/cron/* keep their own CRON_SECRET bearer check.
 *   - /api/check + /api/check/bulk keep their own WEBHOOK_API_KEY check.
 *   - /api/icon, /api/apple-icon, /api/opengraph-image, /robots.txt,
 *     /manifest.webmanifest stay open (Next file-conventions).
 */
import { NextResponse } from "next/server";
import { auth, isAuthEnabled } from "@/auth";

const PUBLIC_PREFIXES = [
  "/signin",
  "/api/auth",
  "/api/cron",
  "/api/check",      // protected by WEBHOOK_API_KEY when set; rate-limited otherwise
  "/api/check/bulk",
  "/icon",
  "/apple-icon",
  "/opengraph-image",
  "/robots.txt",
  "/manifest.webmanifest",
];

export default auth((req) => {
  if (!isAuthEnabled()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (req.auth) return NextResponse.next();

  // API requests: return 401 instead of redirecting to HTML.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL("/signin", req.nextUrl);
  url.searchParams.set("returnTo", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
});

export const config = {
  // Match everything except Next's static assets + _next internal routes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
