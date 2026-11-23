import { NextRequest, NextResponse } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import {
  isMobileAuthScheme,
  normalizeNativeAuthScheme,
} from "@/lib/native/auth-handoff";

export const dynamic = "force-dynamic";

const ALLOWED_CALLBACK_PARAMS = new Set(["calendarSync"]);
const ALLOWED_RETURN_PATHS = new Set([
  "/calendar",
  "/dashboard/schedule",
  "/tutor/schedule",
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDesktopHandoffHtml(deepLink: string, succeeded: boolean): string {
  const escapedHref = escapeHtml(deepLink);
  const serializedUrl = JSON.stringify(deepLink).replace(/</g, "\\u003c");
  const heading = succeeded ? "Akun Google terhubung" : "Gagal menghubungkan Google";
  const subtitle = succeeded
    ? "Membuka kembali aplikasi Zyx Academy. Jika tidak terbuka otomatis, klik tombol di bawah."
    : "Kembali ke aplikasi Zyx Academy untuk mencoba lagi.";

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
      <h1>${escapeHtml(heading)}</h1>
      <p class="muted">${escapeHtml(subtitle)}</p>
      <a class="btn" href="${escapedHref}">Buka Zyx Academy</a>
    </div>
    <script>
      window.location.href = ${serializedUrl};
    </script>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
  const scheme = normalizeNativeAuthScheme(request.nextUrl.searchParams.get("scheme"));
  const rawNext = request.nextUrl.searchParams.get("next") ?? "/calendar";
  const safeNext = getSafeRedirectPath(rawNext);
  const rawParam = request.nextUrl.searchParams.get("param") ?? "calendarSync";
  const paramKey = ALLOWED_CALLBACK_PARAMS.has(rawParam) ? rawParam : "calendarSync";

  if (!scheme) {
    return NextResponse.json({ error: "Invalid native scheme" }, { status: 400 });
  }

  const nextPathOnly = (safeNext.split(/[?#]/)[0] ?? "/calendar").replace(/\/+$/, "") || "/";
  const targetPath = ALLOWED_RETURN_PATHS.has(nextPathOnly) ? nextPathOnly : "/calendar";

  const hasProviderError = Boolean(request.nextUrl.searchParams.get("error"));
  const succeeded = !hasProviderError && request.nextUrl.searchParams.get("status") !== "error";
  const query = new URLSearchParams({ [paramKey]: succeeded ? "1" : "error" });
  const deepLink = `${scheme}://${targetPath.replace(/^\/+/, "")}?${query.toString()}`;

  if (isMobileAuthScheme(scheme)) {
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: deepLink,
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(buildDesktopHandoffHtml(deepLink, succeeded), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
