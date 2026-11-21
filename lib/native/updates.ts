/**
 * lib/native/updates.ts
 *
 * Pure release selection, version comparison, and native in-app installer bridge
 * for Zyx Academy Mobile (Capacitor Android/iOS) and Desktop (Tauri v2).
 */

import {
  getCapacitor,
  getNativeRuntime,
  getTauri,
  type CapacitorPluginListenerHandle,
  type NativeRuntime,
} from "./runtime";

export type AppUpdateChannel = "nightly" | "stable";
export type AppUpdatePlatform = "android" | "ios" | "windows" | "macos" | "linux" | "unknown";

export interface InstalledAppMeta {
  runtime: NativeRuntime;
  channel: AppUpdateChannel;
  version: string;
  buildId: string | null;
  platform: AppUpdatePlatform;
}

export interface LatestAppRelease {
  channel: AppUpdateChannel;
  tag: string;
  version: string;
  buildId: string | null;
  publishedAt: string | null;
  releaseUrl: string;
  downloads: {
    android: string | null;
    windows: string | null;
    macos: string | null;
    linuxDeb: string | null;
    linuxAppImage: string | null;
  };
}

export interface GitHubReleaseItem {
  tag_name?: string;
  draft?: boolean;
  published_at?: string | null;
  html_url?: string;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
  }>;
}

const NIGHTLY_TAG_RE = /^app-v(.+)-nightly\.(\d{8})\.([a-f0-9]{7,})$/i;
const STABLE_TAG_RE = /^app-v([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)$/;

export function parseReleaseTag(tag: string): {
  channel: AppUpdateChannel;
  version: string;
  buildId: string | null;
} | null {
  const nightly = NIGHTLY_TAG_RE.exec(tag);
  if (nightly) {
    return {
      channel: "nightly",
      version: nightly[1],
      buildId: nightly[3].slice(0, 7).toLowerCase(),
    };
  }
  if (tag.includes("-nightly")) return null;
  const stable = STABLE_TAG_RE.exec(tag);
  if (stable) {
    // Strip optional auto-build suffix like `-b123` from semver comparison
    const buildMatch = /-b(\d+)$/.exec(stable[1]);
    return {
      channel: "stable",
      version: buildMatch ? stable[1].slice(0, buildMatch.index) : stable[1],
      buildId: buildMatch ? `b${buildMatch[1]}` : null,
    };
  }
  return null;
}

export function selectLatestReleaseForChannel(
  releases: readonly GitHubReleaseItem[],
  channel: AppUpdateChannel,
): LatestAppRelease | null {
  for (const item of releases) {
    if (item.draft || !item.tag_name || !item.html_url) continue;
    const parsed = parseReleaseTag(item.tag_name);
    if (!parsed || parsed.channel !== channel) continue;

    const assets = item.assets ?? [];
    const findAsset = (suffix: string) =>
      assets.find((asset) => asset.name?.toLowerCase().endsWith(suffix))
        ?.browser_download_url ?? null;

    return {
      channel,
      tag: item.tag_name,
      version: parsed.version,
      buildId: parsed.buildId,
      publishedAt: item.published_at ?? null,
      releaseUrl: item.html_url,
      downloads: {
        android: findAsset(".apk"),
        windows: findAsset(".exe"),
        macos: findAsset(".dmg"),
        linuxDeb: findAsset(".deb"),
        linuxAppImage: findAsset(".appimage"),
      },
    };
  }
  return null;
}

function parseSemverParts(version: string): {
  core: [number, number, number];
  prerelease: string[];
} | null {
  const cleaned = version.trim().replace(/^v/i, "");
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(cleaned);
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

/**
 * Returns > 0 if `a` is newer than `b`, < 0 if older, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemverParts(a);
  const pb = parseSemverParts(b);
  if (!pa || !pb) return a.localeCompare(b);

  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i];
  }

  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0;
  if (pa.prerelease.length === 0) return 1;
  if (pb.prerelease.length === 0) return -1;

  const maxLen = Math.max(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < maxLen; i++) {
    const left = pa.prerelease[i];
    const right = pb.prerelease[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const leftNum = /^\d+$/.test(left) ? Number(left) : null;
    const rightNum = /^\d+$/.test(right) ? Number(right) : null;
    if (leftNum !== null && rightNum !== null) {
      if (leftNum !== rightNum) return leftNum - rightNum;
    } else if (leftNum !== null) {
      return -1;
    } else if (rightNum !== null) {
      return 1;
    } else if (left !== right) {
      return left.localeCompare(right);
    }
  }
  return 0;
}

export function isUpdateAvailable(
  installed: Pick<InstalledAppMeta, "channel" | "version" | "buildId">,
  latest: Pick<LatestAppRelease, "channel" | "version" | "buildId">,
): boolean {
  if (installed.channel !== latest.channel) return false;

  const semverDiff = compareSemver(latest.version, installed.version);
  if (semverDiff > 0) return true;
  if (semverDiff < 0) return false;

  if (installed.channel === "nightly") {
    if (!latest.buildId) return false;
    if (!installed.buildId) return true;
    return installed.buildId.toLowerCase() !== latest.buildId.toLowerCase();
  }

  const latestBuildNum = /^b(\d+)$/i.exec(latest.buildId ?? "");
  if (!latestBuildNum) return false;
  const installedBuildNum = /^b(\d+)$/i.exec(installed.buildId ?? "");
  const installedNum = installedBuildNum ? Number(installedBuildNum[1]) : 0;
  return Number(latestBuildNum[1]) > installedNum;
}

export function parseInstalledAppMetaFromUa(input: {
  runtime: NativeRuntime;
  userAgent: string;
  hostname: string;
  capacitorPlatform?: string;
}): InstalledAppMeta {
  const ua = input.userAgent || "";
  const versionMatch = /Zyx(?:Mobile|Desktop)App\/([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)/i.exec(ua);
  const buildMatch = /build=([a-z0-9]+)/i.exec(ua);
  const isNightly =
    /nightly/i.test(ua) || input.hostname.toLowerCase() === "staging.zyxacademy.com";

  let platform: AppUpdatePlatform = "unknown";
  if (input.runtime === "capacitor") {
    const capPlat = (input.capacitorPlatform || "").toLowerCase();
    platform = capPlat === "ios" ? "ios" : "android";
  } else if (input.runtime === "tauri") {
    if (/Mac/i.test(ua)) platform = "macos";
    else if (/Win/i.test(ua)) platform = "windows";
    else platform = "linux";
  }

  return {
    runtime: input.runtime,
    channel: isNightly ? "nightly" : "stable",
    version: versionMatch?.[1] ?? "0.1.0-alpha.1",
    buildId: buildMatch?.[1]?.toLowerCase() ?? null,
    platform,
  };
}

export async function getInstalledAppMeta(): Promise<InstalledAppMeta | null> {
  if (typeof window === "undefined") return null;
  const runtime = getNativeRuntime();
  if (runtime === "web") return null;

  if (runtime === "tauri") {
    const invoke = getTauri()?.core?.invoke;
    if (invoke) {
      try {
        const info = await invoke<{
          version: string;
          channel: AppUpdateChannel;
          buildId: string;
          platform: AppUpdatePlatform;
        }>("get_app_update_info");
        if (info?.version) {
          return {
            runtime: "tauri",
            channel: info.channel === "nightly" ? "nightly" : "stable",
            version: info.version,
            buildId: info.buildId && info.buildId !== "dev" ? info.buildId : null,
            platform: info.platform,
          };
        }
      } catch {
        // Fall through to UA-based metadata
      }
    }
  }

  const cap = getCapacitor();
  return parseInstalledAppMetaFromUa({
    runtime,
    userAgent: navigator.userAgent,
    hostname: window.location.hostname,
    capacitorPlatform: typeof cap?.getPlatform === "function" ? cap.getPlatform() : undefined,
  });
}

export function selectDownloadUrlForPlatform(
  release: LatestAppRelease,
  platform: AppUpdatePlatform,
): string | null {
  switch (platform) {
    case "android":
      return release.downloads.android;
    case "windows":
      return release.downloads.windows;
    case "macos":
      return release.downloads.macos;
    case "linux":
      return release.downloads.linuxDeb ?? release.downloads.linuxAppImage;
    default:
      return null;
  }
}

export async function fetchLatestAppRelease(
  channel: AppUpdateChannel,
): Promise<LatestAppRelease | null> {
  try {
    const res = await fetch(`/api/app/latest?channel=${encodeURIComponent(channel)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { release?: LatestAppRelease | null };
    return data.release ?? null;
  } catch {
    return null;
  }
}

export type InstallUpdateOutcome =
  | { status: "started" }
  | { status: "permission_required" }
  | { status: "opened_external" }
  | { status: "error"; message: string };

export async function installAppUpdate(
  meta: InstalledAppMeta,
  release: LatestAppRelease,
  onProgress?: (percent: number) => void,
): Promise<InstallUpdateOutcome> {
  const downloadUrl = selectDownloadUrlForPlatform(release, meta.platform);

  if (meta.runtime === "capacitor" && meta.platform === "android") {
    const updater = getCapacitor()?.Plugins?.ZyxAppUpdater;
    if (updater && downloadUrl) {
      let handle: CapacitorPluginListenerHandle | null = null;
      try {
        if (updater.addListener && onProgress) {
          handle = await updater.addListener("downloadProgress", (event) => {
            if (typeof event?.percent === "number") {
              onProgress(event.percent);
            }
          });
        }
        await updater.downloadAndInstall({ url: downloadUrl });
        return { status: "started" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("INSTALL_PERMISSION_REQUIRED")) {
          return { status: "permission_required" };
        }
        return { status: "error", message: msg };
      } finally {
        if (handle) {
          void handle.remove().catch(() => {});
        }
      }
    }

    const fallbackUrl = downloadUrl ?? release.releaseUrl;
    const browser = getCapacitor()?.Plugins?.Browser;
    if (browser?.open) {
      await browser.open({ url: fallbackUrl });
      return { status: "opened_external" };
    }
    window.open(fallbackUrl, "_blank", "noopener,noreferrer");
    return { status: "opened_external" };
  }

  if (meta.runtime === "tauri") {
    const tauri = getTauri();
    if (downloadUrl && tauri?.core?.invoke) {
      let unlisten: (() => void) | null = null;
      try {
        if (tauri.event?.listen && onProgress) {
          unlisten = await tauri.event.listen<{ percent?: number }>(
            "zyx-update-progress",
            (event) => {
              if (typeof event.payload?.percent === "number") {
                onProgress(event.payload.percent);
              }
            },
          );
        }
        await tauri.core.invoke("download_and_launch_update", { url: downloadUrl });
        return { status: "started" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { status: "error", message: msg };
      } finally {
        unlisten?.();
      }
    }

    const fallbackUrl = downloadUrl ?? release.releaseUrl;
    if (tauri?.opener?.openUrl) {
      await tauri.opener.openUrl(fallbackUrl);
      return { status: "opened_external" };
    }
    if (tauri?.core?.invoke) {
      await tauri.core.invoke("plugin:opener|open_url", { url: fallbackUrl });
      return { status: "opened_external" };
    }
    return { status: "error", message: "Updater unavailable" };
  }

  return { status: "error", message: "Unsupported runtime" };
}
