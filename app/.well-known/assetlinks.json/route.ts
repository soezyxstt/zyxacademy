import { NextRequest, NextResponse } from "next/server";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { buildAndroidAssetLinks } from "@/lib/well-known/mobile-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.json(buildAndroidAssetLinks({
    configuredOrigin: resolveAuthBaseUrl(),
    requestOrigin: request.nextUrl.origin,
    environment: process.env.ZYX_ENVIRONMENT,
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
