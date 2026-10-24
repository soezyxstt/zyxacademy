import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripPublicLocalePrefix } from "@/lib/public-locale-routes";
import { normalizeLocale } from "@/lib/i18n/locale";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);

  // Never trust a caller-provided locale header. Only a finite public URL
  // prefix below can set it for the rendered page.
  requestHeaders.delete("x-app-locale");

  const explicitPublicLocale = stripPublicLocalePrefix(pathname);
  if (explicitPublicLocale) {
    requestHeaders.set("x-app-locale", explicitPublicLocale.locale);
    // Preserve the incoming origin; Proxy URL normalization is disabled so
    // same-origin rewrites keep the trusted request header intact.
    const destination = new URL(request.url);
    destination.pathname = explicitPublicLocale.path;
    return NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
  }

  // Paths that require a user session (protected paths)
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/courses") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/admin");

  // Authentication paths
  const isAuthRoute = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  if (isAuthRoute) {
    const authLocale = normalizeLocale(request.nextUrl.searchParams.get("locale"));
    if (authLocale) requestHeaders.set("x-app-locale", authLocale);
  }

  // API paths and static assets are excluded from middleware matching in config below,
  // but we return early just in case.
  if (!isProtectedRoute && !isAuthRoute) {
    return NextResponse.next({ request: { headers: requestHeaders } });
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
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Locale identity is sanitized on application and API routes. Static assets
  // bypass Proxy; locale routing itself remains limited to the finite map.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
