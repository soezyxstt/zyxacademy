import "server-only";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { selectLatestReleaseForChannel, type AppUpdateChannel, type GitHubReleaseItem } from "./updates";

const releasesApi = "https://api.github.com/repos/soezyxstt/zyxacademy/releases";

export function getDownloadChannel(): AppUpdateChannel {
  return new URL(resolveAuthBaseUrl()).hostname === "staging.zyxacademy.com" ? "nightly" : "stable";
}

export async function readPublishedRelease(channel: AppUpdateChannel) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ZyxAcademyAppUpdater/1.0",
  };
  if (process.env.GITHUB_RELEASES_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_RELEASES_TOKEN}`;
  }
  const request = (url: string) => fetch(url, {
    headers, next: { revalidate: 300 }, signal: AbortSignal.timeout(8000),
  });

  try {
    if (channel === "stable") {
      // GitHub lets maintainers mark an older stable release as Latest for rollback.
      const latest = await request(`${releasesApi}/latest`);
      if (latest.ok) {
        const release = selectLatestReleaseForChannel([await latest.json()], channel);
        if (release) return { release };
      } else if (latest.status !== 404) {
        return { release: null, error: `github_http_${latest.status}` };
      }
    }
    for (let page = 1; ; page++) {
      const response = await request(`${releasesApi}?per_page=100&page=${page}`);
      if (!response.ok) return { release: null, error: `github_http_${response.status}` };
      const items: GitHubReleaseItem[] = await response.json();
      const release = selectLatestReleaseForChannel(items, channel);
      if (release || !response.headers.get("link")?.includes('rel="next"')) return { release };
    }
  } catch {
    return { release: null, error: "github_network_error" };
  }
}
