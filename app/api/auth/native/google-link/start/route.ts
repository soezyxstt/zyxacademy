import { NextRequest, NextResponse } from "next/server";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { resolveNativeRequestOrigin } from "@/lib/native/auth-handoff";
import {
  consumeNativeGoogleLinkHandoff,
  isAllowedOAuthStateCookieName,
} from "@/lib/native/google-link-handoff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildExpiredHtml(): string {
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tautan kedaluwarsa</title>
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
      .muted { font-size: 14px; color: #4b5563; margin: 0; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Tautan koneksi tidak valid atau kedaluwarsa</h1>
      <p class="muted">Kembali ke aplikasi Zyx Academy dan ulangi proses penghubungan akun Google.</p>
    </div>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  const handoff = token ? await consumeNativeGoogleLinkHandoff(token) : null;

  if (!handoff) {
    return new NextResponse(buildExpiredHtml(), {
      status: 410,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const { isHttps } = resolveNativeRequestOrigin(request);
  const response = NextResponse.redirect(handoff.googleUrl, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });

  for (const rawCookie of handoff.setCookies) {
    for (const [name, cookie] of parseSetCookieHeader(rawCookie)) {
      if (!isAllowedOAuthStateCookieName(name)) continue;
      const options = toCookieOptions(cookie);
      response.cookies.set(name, cookie.value, {
        ...options,
        secure: Boolean(options.secure || isHttps),
      });
    }
  }

  return response;
}
