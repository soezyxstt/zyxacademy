import { headers } from "next/headers";
import type { AppUpdateChannel } from "@/lib/native/updates";

export function getDownloadChannel(): AppUpdateChannel { return "stable"; }
export async function readPublishedRelease(channel: AppUpdateChannel) {
  switch ((await headers()).get("x-fixture-state")) {
    case "empty": return { release: null };
    case "error": return { release: null, error: "fixture unavailable" };
    default: return {
      release: {
        channel, version: "0.0.0", buildId: null, tag: "app-v0.0.0", publishedAt: null,
        releaseUrl: "https://example.test/release",
        downloads: { android: "https://example.test/release/zyx.apk", windows: null, linuxDeb: null, linuxAppImage: null, macos: null },
      },
    };
  }
}
