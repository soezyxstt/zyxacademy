import { NextRequest, NextResponse } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import {
  NATIVE_AUTH_HANDOFF_COOKIE,
  normalizeNativeAuthScheme,
  normalizeNativeAuthState,
  resolveNativeRequestOrigin,
} from "@/lib/native/auth-handoff";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scheme = normalizeNativeAuthScheme(request.nextUrl.searchParams.get("scheme"));
  const state = normalizeNativeAuthState(request.nextUrl.searchParams.get("state"));
  const safeNext = getSafeRedirectPath(request.nextUrl.searchParams.get("next") ?? undefined);

  if (!scheme || !state) {
    return NextResponse.json({ error: "Invalid native auth parameters" }, { status: 400 });
  }

  const { origin, isHttps } = resolveNativeRequestOrigin(request);
  const startPage = new URL("/auth/native-start", origin);
  startPage.searchParams.set("scheme", scheme);
  startPage.searchParams.set("state", state);
  startPage.searchParams.set("next", safeNext);

  const response = NextResponse.redirect(startPage, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });

  response.cookies.set(
    NATIVE_AUTH_HANDOFF_COOKIE,
    JSON.stringify({ scheme, state, next: safeNext }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps,
      path: "/api/auth/native",
      maxAge: 300,
    },
  );

  return response;
}
