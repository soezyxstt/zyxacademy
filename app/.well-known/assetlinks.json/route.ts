import { NextRequest, NextResponse } from "next/server";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { buildAndroidAssetLinks, resolveForwardedRequestOrigin } from "@/lib/well-known/mobile-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestOrigin = resolveForwardedRequestOrigin(
    request.nextUrl.origin,
    request.headers.get("x-forwarded-proto"),
    request.headers.get("x-forwarded-host"),
  );
  return NextResponse.json(buildAndroidAssetLinks({
    configuredOrigin: resolveAuthBaseUrl(),
    requestOrigin,
    environment: process.env.ZYX_ENVIRONMENT,
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
