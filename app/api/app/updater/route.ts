import { NextRequest, NextResponse } from "next/server";
import {
  selectLatestUpdaterManifestUrl,
  type AppUpdateChannel,
  type GitHubReleaseItem,
} from "@/lib/native/updates";

const GITHUB_RELEASES_API =
  "https://api.github.com/repos/soezyxstt/zyxacademy/releases?per_page=20";
const ALLOWED_DOWNLOAD_PREFIX =
  "https://github.com/soezyxstt/zyxacademy/releases/download/";

export async function GET(request: NextRequest) {
  const rawChannel = request.nextUrl.searchParams.get("channel")?.trim().toLowerCase();
  const channel: AppUpdateChannel = rawChannel === "nightly" ? "nightly" : "stable";

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ZyxAcademyAppUpdater/1.0",
  };
  if (process.env.GITHUB_RELEASES_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_RELEASES_TOKEN}`;
  }

  try {
    const res = await fetch(GITHUB_RELEASES_API, {
      headers,
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `github_http_${res.status}` },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const items = (await res.json()) as GitHubReleaseItem[];
    const manifestUrl = selectLatestUpdaterManifestUrl(
      Array.isArray(items) ? items : [],
      channel,
    );

    if (!manifestUrl || !manifestUrl.startsWith(ALLOWED_DOWNLOAD_PREFIX)) {
      // Tauri v2 updater treats 204 No Content as "no update available".
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      });
    }

    const manifestRes = await fetch(manifestUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ZyxAcademyAppUpdater/1.0",
      },
      next: { revalidate: 300 },
    });
    if (!manifestRes.ok) {
      return NextResponse.json(
        { error: `manifest_http_${manifestRes.status}` },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const manifest = (await manifestRes.json()) as Record<string, unknown>;
    return NextResponse.json(manifest, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "github_network_error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
