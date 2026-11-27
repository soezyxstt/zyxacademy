import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripPublicLocalePrefix } from "@/lib/public-locale-routes";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/shared";
import { normalizeLocale, resolveLocale } from "@/lib/i18n/locale";
import {
  DASHBOARD_ENTRY_COOKIE_NAME,
  DASHBOARD_ENTRY_COOLDOWN_SECONDS,
  ENTRY_REDIRECT_ROUTE,
  getSafeEntryReturnPath,
  isAppEntryVisitedPath,
  isDocumentGetNavigation,
  isNativeMarketingRedirectPath,
  isNativeUserAgent,
} from "@/lib/auth/dashboard-entry";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);

  // Never trust a caller-provided locale header. Only a finite public URL
  // routing below can set it for the rendered page.
  requestHeaders.delete("x-app-locale");

  // Fast, Edge-safe coarse cookie check without internal HTTP round-trip
  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value ||
    request.cookies.get("__Secure-better-auth.session_token")?.value;

  const explicitPublicLocale = stripPublicLocalePrefix(pathname);
  const isMarketingRoot = pathname === "/" || explicitPublicLocale?.path === "/";

  // Native app shells (mobile & desktop) should never land on marketing pages.
  // Authenticated users go directly to their role dashboard; unauthenticated
  // users go directly to /sign-in.
  if (
    isNativeUserAgent(request.headers.get("user-agent")) &&
    isNativeMarketingRedirectPath(pathname) &&
    isDocumentGetNavigation(request)
  ) {
    if (sessionToken) {
      const destination = new URL(request.url);
      destination.pathname = ENTRY_REDIRECT_ROUTE;
      destination.search = "";
      destination.searchParams.set("native", "1");
      return NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
    }
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  // First visit in a while with an active session: rewrite to the server entry
  // redirect handler so the user lands directly on their role dashboard
  // (admin -> tutor -> student). Once the cooldown cookie is set, visiting the
  // marketing root renders normally.
  if (
    isMarketingRoot &&
    sessionToken &&
    !request.cookies.get(DASHBOARD_ENTRY_COOKIE_NAME)?.value &&
    isDocumentGetNavigation(request)
  ) {
    const destination = new URL(request.url);
    destination.pathname = ENTRY_REDIRECT_ROUTE;
    destination.search = "";
    destination.searchParams.set("returnTo", getSafeEntryReturnPath(pathname));
    return NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
  }

  if (explicitPublicLocale) {
    requestHeaders.set("x-app-locale", explicitPublicLocale.locale);
    // Preserve the incoming origin; Proxy URL normalization is disabled so
    // same-origin rewrites keep the trusted request header intact.
    const destination = new URL(request.url);
    destination.pathname = explicitPublicLocale.path;
    return NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
  }

  // Demo language comes from the browser, without loading a visitor's real account.
  if (pathname === "/demo" || pathname.startsWith("/demo/")) {
    requestHeaders.set("x-app-locale", resolveLocale({ cookieLocale: request.cookies.get(LOCALE_COOKIE_NAME)?.value, acceptLanguage: request.headers.get("accept-language") }));
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Paths that require a user session (protected paths)
  const isProtectedRoute =
    pathname === "/discussions" ||
    pathname.startsWith("/discussions/") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/courses") ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/tutor") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/admin");

  // Authentication paths
  const isAuthRoute = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  if (isAuthRoute) {
    const authLocale = normalizeLocale(request.nextUrl.searchParams.get("locale"));
    if (authLocale) requestHeaders.set("x-app-locale", authLocale);
  }

  // 1. Unauthenticated users trying to access protected paths -> redirect to /sign-in
  if (isProtectedRoute && !sessionToken) {
    const signInUrl = new URL("/sign-in", request.url);
    // Preserve the query string so OAuth can return the user to the exact
    // filtered or paginated view they attempted to open. URLSearchParams
    // encodes the local path as one query value and prevents parameter injection.
    signInUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(signInUrl);
  }

  // Authoritative session verification and canonical role checks (hasPeran)
  // are performed by route-group layouts and server actions.
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Refresh the entry-cooldown cookie while the user is actively using the app
  // so intentionally visiting the marketing site afterwards does not bounce
  // them back to the dashboard until they have been away for a while.
  if (
    sessionToken &&
    isAppEntryVisitedPath(pathname) &&
    isDocumentGetNavigation(request)
  ) {
    response.cookies.set(DASHBOARD_ENTRY_COOKIE_NAME, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: DASHBOARD_ENTRY_COOLDOWN_SECONDS,
    });
  }

  return response;
}

export const config = {
  // Locale identity is sanitized on application and API routes. Static assets
  // and binary storage proxy responses bypass Proxy; locale routing itself
  // remains limited to the finite map.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/storage/file/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
