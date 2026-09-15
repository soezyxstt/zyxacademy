import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Paths that require a user session (protected paths)
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/courses") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/admin");

  // Authentication paths
  const isAuthRoute = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");

  // API paths and static assets are excluded from middleware matching in config below,
  // but we return early just in case.
  if (!isProtectedRoute && !isAuthRoute) {
    return NextResponse.next();
  }

  // Fast, Edge-safe coarse cookie check without internal HTTP round-trip
  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value ||
    request.cookies.get("__Secure-better-auth.session_token")?.value;

  // 1. Unauthenticated users trying to access protected paths -> redirect to /sign-in
  if (isProtectedRoute && !sessionToken) {
    const signInUrl = new URL("/sign-in", request.url);
    // Preserve the query string so OAuth can return the user to the exact
    // filtered or paginated view they attempted to open. URLSearchParams
    // encodes the local path as one query value and prevents parameter injection.
    signInUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(signInUrl);
  }

  // 2. Authenticated users trying to access auth paths (/sign-in, /sign-up)
  if (isAuthRoute && sessionToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Authoritative session verification and canonical role checks (hasPeran)
  // are performed by route-group layouts and server actions.
  return NextResponse.next();
}

export const config = {
  // Protect routes but skip Next.js internals, static assets, and api endpoints
  matcher: [
    "/dashboard/:path*",
    "/courses/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/sign-in",
    "/sign-up",
  ],
};
