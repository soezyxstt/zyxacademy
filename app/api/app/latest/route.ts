import { NextRequest, NextResponse } from "next/server";
import { readPublishedExpoAndroidRelease, readPublishedRelease } from "@/lib/native/published-release";

export async function GET(request: NextRequest) {
  const channel = request.nextUrl.searchParams.get("channel")?.trim().toLowerCase();
  const result = request.nextUrl.searchParams.get("target") === "expo-android"
    ? await readPublishedExpoAndroidRelease()
    : await readPublishedRelease(channel === "nightly" ? "nightly" : "stable");
  return NextResponse.json(result, {
    status: result.error ? 503 : 200,
    headers: {
      "Cache-Control": result.error ? "no-store" : "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
