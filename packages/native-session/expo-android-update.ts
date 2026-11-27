export const EXPO_ANDROID_PACKAGE = "com.zyx.academy.nativeparity";
export const EXPO_ANDROID_UPDATE_MAX_BYTES = 256 * 1024 * 1024;
const repoDownload = "https://github.com/soezyxstt/zyxacademy/releases/download/";
const tagPattern = /^expo-android-v([0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?)-b([1-9][0-9]{0,9})$/;
const digestPattern = /^[a-f0-9]{64}$/;

export type ExpoAndroidRelease = Readonly<{
  packageName: typeof EXPO_ANDROID_PACKAGE;
  tag: string;
  version: string;
  versionCode: number;
  bytes: number;
  sha256: string;
  url: string;
}>;

function object(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

function releaseArchive(tag: unknown) {
  if (typeof tag !== "string" || tag.length > 90) return;
  const match = tagPattern.exec(tag);
  if (!match) return;
  const version = match[1];
  const versionCode = Number(match[2]);
  if (version.length > 60 || versionCode > 2_100_000_000) return;
  const name = `zyx-academy-expo-android-${version}-b${versionCode}.apk`;
  return { tag, version, versionCode, name, url: `${repoDownload}${tag}/${name}` };
}

export function parseExpoAndroidRelease(input: unknown): ExpoAndroidRelease | null {
  const value = object(input);
  const archive = releaseArchive(value?.tag);
  if (!value || !archive || value.packageName !== EXPO_ANDROID_PACKAGE || value.version !== archive.version
    || value.versionCode !== archive.versionCode || value.url !== archive.url
    || typeof value.bytes !== "number" || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > EXPO_ANDROID_UPDATE_MAX_BYTES
    || typeof value.sha256 !== "string" || !digestPattern.test(value.sha256)) return null;
  return { packageName: EXPO_ANDROID_PACKAGE, tag: archive.tag, version: archive.version,
    versionCode: archive.versionCode, bytes: value.bytes, sha256: value.sha256, url: archive.url };
}

export function selectExpoAndroidRelease(releases: readonly unknown[]): ExpoAndroidRelease | null {
  const candidates: ExpoAndroidRelease[] = [];
  for (const input of releases) {
    const release = object(input);
    if (release?.draft !== false || release.prerelease !== true || !Array.isArray(release.assets)) continue;
    const archive = releaseArchive(release.tag_name);
    if (!archive) continue;
    const matches = release.assets.map(object).filter(asset => asset?.name === archive.name);
    if (matches.length !== 1) continue;
    const asset = matches[0];
    if (asset?.state !== "uploaded" || asset.browser_download_url !== archive.url
      || typeof asset.digest !== "string" || !asset.digest.startsWith("sha256:")) continue;
    const candidate = parseExpoAndroidRelease({ ...archive, packageName: EXPO_ANDROID_PACKAGE,
      bytes: asset.size, sha256: asset.digest.slice("sha256:".length) });
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((left, right) => right.versionCode - left.versionCode);
  const latest = candidates[0];
  return latest && candidates[1]?.versionCode !== latest.versionCode ? latest : null;
}

export function newerExpoAndroidRelease(release: ExpoAndroidRelease | null, installedVersionCode: number) {
  return release && Number.isSafeInteger(installedVersionCode) && installedVersionCode > 0
    && release.versionCode > installedVersionCode ? release : null;
}
