import { resolveLocale } from "@/lib/i18n/locale";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/shared";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import {
  buildNativeAuthDeepLink,
  isMobileAuthScheme,
  NATIVE_AUTH_HANDOFF_COOKIE,
  normalizeNativeAuthState,
  resolveNativeRequestOrigin,
} from "@/lib/native/auth-handoff";

import { normalizeBrowserHandoffScheme, EXPO_STAGING_ORIGIN, EXPO_STAGING_SCHEME } from "@/lib/native/expo-auth-config";
import { encodeExpoAuthCode, isExpoCodeChallenge } from "@/lib/native/expo-auth-code";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function buildDesktopHandoffHtml(deepLink: string, request: NextRequest) {
  const locale = resolveLocale({
    explicitUrlLocale: request.headers.get("x-app-locale"),
    cookieLocale: request.cookies.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
  const { default: messages } = locale === "en"
    ? await import("@/messages/en/auth.json")
    : await import("@/messages/id/auth.json");
  const escapedHref = escapeHtml(deepLink);
  const serializedUrl = JSON.stringify(deepLink);
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(messages.native.returnTitle)}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #ffffff;
        color: #111827;
        padding: 24px;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #111111; color: #f9fafb; }
        .card { background: #1a1a1a; border-color: #2e2e2e; }
        .muted { color: #a1a1aa; }
      }
      .card {
        max-width: 400px;
        width: 100%;
        padding: 24px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        text-align: center;
      }
      h1 { font-size: 18px; margin: 0 0 8px; }
      .muted { font-size: 14px; color: #4b5563; margin: 0 0 20px; }
      .btn {
        display: inline-block;
        padding: 10px 18px;
        border-radius: 8px;
        background: #2a3c6a;
        color: #ffffff;
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(messages.native.signedIn)}</h1>
      <p class="muted">${escapeHtml(messages.native.reopening)}</p>
      <a class="btn" href="${escapedHref}">${escapeHtml(messages.native.openApp)}</a>
    </div>
    <script>
      window.location.href = ${serializedUrl};
    </script>
  </body>
</html>`;
}

function readHandoffCookie(
  request: NextRequest,
): { scheme: string; state: string; next: string; challenge?: string } | null {
  const raw = request.cookies.get(NATIVE_AUTH_HANDOFF_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed?.scheme === "string" &&
      typeof parsed?.state === "string" &&
      typeof parsed?.next === "string"
    ) {
      return {
        scheme: parsed.scheme,
        state: parsed.state,
        next: parsed.next,
        challenge: typeof parsed.challenge === "string" ? parsed.challenge : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const scheme = normalizeBrowserHandoffScheme(request.nextUrl.searchParams.get("scheme"));
  const state = normalizeNativeAuthState(request.nextUrl.searchParams.get("state"));
  const safeNext = getSafeRedirectPath(request.nextUrl.searchParams.get("next") ?? undefined);

  if (!scheme || !state) {
    return NextResponse.json({ error: "Invalid native auth parameters" }, { status: 400 });
  }

  // Require a matching HttpOnly handoff cookie created by /api/auth/native/start
  // so cross-site top-level GETs cannot silently mint bearer tokens.
  const handoff = readHandoffCookie(request);
  if (!handoff || handoff.scheme !== scheme || handoff.state !== state) {
    return NextResponse.json({ error: "Missing or invalid auth handoff session" }, { status: 403 });
  }

  const expo = scheme === EXPO_STAGING_SCHEME;
  if (expo && (new URL(resolveAuthBaseUrl()).origin !== EXPO_STAGING_ORIGIN || !isExpoCodeChallenge(handoff.challenge))) {
    return NextResponse.json({ error: "Invalid native auth parameters" }, { status: 400 });
  }

  let token: string | null = null;
  try {
    const result = await auth.api.generateOneTimeToken({
      headers: request.headers,
    });
    token = typeof result?.token === "string" && result.token.length > 0 ? result.token : null;
  } catch {
    token = null;
  }

  const { origin, isHttps } = resolveNativeRequestOrigin(request);

  if (!token) {
    const retryUrl = new URL("/api/auth/native/start", origin);
    retryUrl.searchParams.set("scheme", scheme);
    retryUrl.searchParams.set("state", state);
    retryUrl.searchParams.set("next", safeNext);
    if (expo && handoff.challenge) retryUrl.searchParams.set("challenge", handoff.challenge);
    return NextResponse.redirect(retryUrl, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let deepLink: string;
  if (scheme === EXPO_STAGING_SCHEME) {
    const { secret } = await auth.$context;
    const code = await encodeExpoAuthCode(token, handoff.challenge!, secret);
    deepLink = `${scheme}://auth/native-finish#${new URLSearchParams({ code, state })}`;
  } else {
    deepLink = buildNativeAuthDeepLink(scheme, token, state, safeNext);
  }

  const response = scheme === EXPO_STAGING_SCHEME || isMobileAuthScheme(scheme)
    ? new NextResponse(null, {
        status: 302,
        headers: {
          Location: deepLink,
          "Cache-Control": "no-store",
        },
      })
    : new NextResponse(await buildDesktopHandoffHtml(deepLink, request), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });

  response.cookies.set(NATIVE_AUTH_HANDOFF_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/api/auth/native",
    maxAge: 0,
  });

  return response;
}
