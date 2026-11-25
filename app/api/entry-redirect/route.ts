import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth-session";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import {
  DASHBOARD_ENTRY_COOKIE_NAME,
  DASHBOARD_ENTRY_COOLDOWN_SECONDS,
  DASHBOARD_ENTRY_STALE_COOLDOWN_SECONDS,
  getSafeEntryReturnPath,
} from "@/lib/auth/dashboard-entry";
import { resolveUserDashboardPath } from "@/lib/auth/dashboard-entry-server";
import {
  NATIVE_LAST_ROUTE_COOKIE_NAME,
  resolveNativeEntryDestination,
} from "@/lib/native/route-persistence";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isNative = request.nextUrl.searchParams.get("native") === "1";
  const returnTo = getSafeEntryReturnPath(
    request.nextUrl.searchParams.get("returnTo"),
  );
  // Cloud Run route requests use the internal standalone server origin.
  const publicOrigin = new URL(resolveAuthBaseUrl());
  const isSecure = publicOrigin.protocol === "https:";

  try {
    const session = await getAuthSession();
    if (session?.user?.id) {
      const roleDashboard = await resolveUserDashboardPath(session.user.id);
      const destination = isNative
        ? resolveNativeEntryDestination({
            rawCookieValue: request.cookies.get(NATIVE_LAST_ROUTE_COOKIE_NAME)?.value,
            userId: session.user.id,
            roleDashboard,
          })
        : roleDashboard;
      const response = NextResponse.redirect(new URL(destination, publicOrigin));
      response.headers.set("Cache-Control", "no-store");
      response.cookies.set(DASHBOARD_ENTRY_COOKIE_NAME, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: isSecure,
        path: "/",
        maxAge: DASHBOARD_ENTRY_COOLDOWN_SECONDS,
      });
      return response;
    }
  } catch (error) {
    console.error("[entry-redirect] Failed to resolve role dashboard:", error);
  }

  const fallbackPath = isNative ? "/sign-in" : returnTo;
  const fallback = NextResponse.redirect(new URL(fallbackPath, publicOrigin));
  fallback.headers.set("Cache-Control", "no-store");
  if (!isNative) {
    fallback.cookies.set(DASHBOARD_ENTRY_COOKIE_NAME, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      path: "/",
      maxAge: DASHBOARD_ENTRY_STALE_COOLDOWN_SECONDS,
    });
  }
  return fallback;
}
