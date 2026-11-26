import "server-only";
import { selectExpoAndroidRelease } from "@/packages/native-session/expo-android-update";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { selectLatestReleaseForChannel, type AppUpdateChannel, type GitHubReleaseItem } from "./updates";

const releasesApi = "https://api.github.com/repos/soezyxstt/zyxacademy/releases";

export function getDownloadChannel(): AppUpdateChannel {
  return new URL(resolveAuthBaseUrl()).hostname === "staging.zyxacademy.com" ? "nightly" : "stable";
}

function createReleaseRequest() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ZyxAcademyAppUpdater/1.0",
  };
  if (process.env.GITHUB_RELEASES_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_RELEASES_TOKEN}`;
  }
  return (url: string) => fetch(url, {
    headers, next: { revalidate: 300 }, signal: AbortSignal.timeout(8000),
  });
}

export async function readPublishedRelease(channel: AppUpdateChannel) {
  const request = createReleaseRequest();

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

export async function readPublishedExpoAndroidRelease() {
  const request = createReleaseRequest();
  const releases: unknown[] = [];
  try {
    // Bound this preview channel to the most recent published pages of the same repository.
    for (let page = 1; page <= 5; page++) {
      const response = await request(`${releasesApi}?per_page=100&page=${page}`);
      if (!response.ok) return { release: null, error: `github_http_${response.status}` };
      const entries: unknown = await response.json();
      if (!Array.isArray(entries)) return { release: null, error: "github_release_invalid" };
      releases.push(...entries);
      if (!response.headers.get("link")?.includes('rel="next"')) break;
    }
    return { release: selectExpoAndroidRelease(releases) };
  } catch {
    return { release: null, error: "github_network_error" };
  }
}
