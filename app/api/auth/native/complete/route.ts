import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import {
  buildNativeAuthDeepLink,
  isMobileAuthScheme,
  NATIVE_AUTH_HANDOFF_COOKIE,
  normalizeNativeAuthScheme,
  normalizeNativeAuthState,
} from "@/lib/native/auth-handoff";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDesktopHandoffHtml(deepLink: string): string {
  const escapedHref = escapeHtml(deepLink);
  const serializedUrl = JSON.stringify(deepLink);
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kembali ke Zyx Academy</title>
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
      <h1>Login berhasil</h1>
      <p class="muted">Membuka kembali aplikasi Zyx Academy. Jika tidak terbuka otomatis, klik tombol di bawah.</p>
      <a class="btn" href="${escapedHref}">Buka Zyx Academy</a>
    </div>
    <script>
      window.location.href = ${serializedUrl};
    </script>
  </body>
</html>`;
}

function readHandoffCookie(
  request: NextRequest,
): { scheme: string; state: string; next: string } | null {
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
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const scheme = normalizeNativeAuthScheme(request.nextUrl.searchParams.get("scheme"));
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

  let token: string | null = null;
  try {
    const result = await auth.api.generateOneTimeToken({
      headers: request.headers,
    });
    token = typeof result?.token === "string" && result.token.length > 0 ? result.token : null;
  } catch {
    token = null;
  }

  if (!token) {
    const retryUrl = new URL("/api/auth/native/start", request.url);
    retryUrl.searchParams.set("scheme", scheme);
    retryUrl.searchParams.set("state", state);
    retryUrl.searchParams.set("next", safeNext);
    return NextResponse.redirect(retryUrl, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const deepLink = buildNativeAuthDeepLink(scheme, token, state, safeNext);

  const response = isMobileAuthScheme(scheme)
    ? new NextResponse(null, {
        status: 302,
        headers: {
          Location: deepLink,
          "Cache-Control": "no-store",
        },
      })
    : new NextResponse(buildDesktopHandoffHtml(deepLink), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });

  response.cookies.set(NATIVE_AUTH_HANDOFF_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/api/auth/native",
    maxAge: 0,
  });

  return response;
}
