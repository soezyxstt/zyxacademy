import { NextResponse } from "next/server";
import { buildAppleAppSiteAssociation } from "@/lib/well-known/mobile-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildAppleAppSiteAssociation(), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
