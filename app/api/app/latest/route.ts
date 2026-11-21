import { NextRequest, NextResponse } from "next/server";
import {
  selectLatestReleaseForChannel,
  type AppUpdateChannel,
  type GitHubReleaseItem,
} from "@/lib/native/updates";

const GITHUB_RELEASES_API =
  "https://api.github.com/repos/soezyxstt/zyxacademy/releases?per_page=20";

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
        { release: null },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const items = (await res.json()) as GitHubReleaseItem[];
    const release = selectLatestReleaseForChannel(Array.isArray(items) ? items : [], channel);

    return NextResponse.json(
      { release },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { release: null },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
