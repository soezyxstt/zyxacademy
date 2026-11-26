import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { readExpoAndroidUpdate, expoAndroidUpdateEndpoint } from "../../apps/mobile-native/device/android-update-policy";
import { EXPO_ANDROID_PACKAGE, EXPO_ANDROID_UPDATE_MAX_BYTES, newerExpoAndroidRelease, parseExpoAndroidRelease, selectExpoAndroidRelease } from "../../packages/native-session/expo-android-update";

const sha256 = "ab".repeat(32);
const version = "0.2.0-preview.1";
const code = 104;
const bytes = 45_000_000;
const base = "https://github.com/soezyxstt/zyxacademy/releases/download/";

function fixture(build = code, versionName = version) {
  const tag = `expo-android-v${versionName}-b${build}`;
  const name = `zyx-academy-expo-android-${versionName}-b${build}.apk`;
  const asset = { name, state: "uploaded", size: bytes, browser_download_url: `${base}${tag}/${name}`, digest: `sha256:${sha256}` };
  const release = { tag_name: tag, draft: false, prerelease: true, assets: [asset] };
  const value = { packageName: EXPO_ANDROID_PACKAGE, tag, version: versionName, versionCode: build, bytes, sha256, url: asset.browser_download_url };
  return { release, asset, value };
}

test("selects an exact non-Capacitor pre-release with trusted GitHub digest and byte count", () => {
  const { release, asset, value } = fixture();
  const capacitor = { tag_name: "app-v0.1.0", draft: false, prerelease: false,
    assets: [{ ...asset, name: "zyx-academy-0.1.0-android.apk" }] };
  expect(selectExpoAndroidRelease([null, capacitor])).toBeNull();
  expect(selectExpoAndroidRelease([capacitor, release, fixture(code - 1).release])).toEqual(value);
  expect(selectExpoAndroidRelease([release, fixture(code + 1).release])).toEqual(fixture(code + 1).value);
  expect(selectExpoAndroidRelease([release, fixture(code, "0.2.0-preview.2").release])).toBeNull();
  expect(selectExpoAndroidRelease([{ ...release, draft: true }])).toBeNull();
  expect(selectExpoAndroidRelease([{ ...release, prerelease: false }])).toBeNull();
  expect(selectExpoAndroidRelease([{ ...release, assets: [asset, asset] }])).toBeNull();
  expect(selectExpoAndroidRelease([{ ...release, assets: [{ ...asset, state: "new" }] }])).toBeNull();
  expect(selectExpoAndroidRelease([{ ...release, assets: [{ ...asset, digest: null }] }])).toBeNull();
  expect(selectExpoAndroidRelease([{ ...release, assets: [{ ...asset, size: EXPO_ANDROID_UPDATE_MAX_BYTES + 1 }] }])).toBeNull();
});

test("the native client requires an exact release tuple and a strictly newer version code", () => {
  const { value } = fixture();
  const admitted = parseExpoAndroidRelease(value);
  expect(admitted).toEqual(value);
  expect(newerExpoAndroidRelease(admitted, code)).toBeNull();
  expect(newerExpoAndroidRelease(admitted, code + 1)).toBeNull();
  expect(newerExpoAndroidRelease(admitted, code - 1)).toEqual(value);
  expect(parseExpoAndroidRelease({ ...value, packageName: "com.zyx.academy" })).toBeNull();
  expect(parseExpoAndroidRelease({ ...value, url: value.url.replace("github.com/", "github.com.evil.tld/") })).toBeNull();
  expect(parseExpoAndroidRelease({ ...value, url: value.url.replace("soezyxstt", "someone-else") })).toBeNull();
  expect(parseExpoAndroidRelease({ ...value, url: value.url + "?download=1" })).toBeNull();
  expect(parseExpoAndroidRelease({ ...value, url: value.url.replace("-expo-", "-nightly-") })).toBeNull();
  expect(parseExpoAndroidRelease({ ...value, version: "0.2.0" })).toBeNull();
  expect(parseExpoAndroidRelease({ ...value, versionCode: code - 1 })).toBeNull();
});

test("uses the isolated existing update check without ambient credentials or redirects", async () => {
  const { value } = fixture();
  const signal = new AbortController().signal;
  expect(await readExpoAndroidUpdate(async (url, init) => {
    expect(url).toBe("https://staging.zyxacademy.com/api/app/latest?target=expo-android");
    expect(url).toBe(expoAndroidUpdateEndpoint);
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("manual");
    expect(new Headers(init.headers).has("Cookie")).toBe(false);
    return Response.json({ release: value });
  }, code - 1, signal)).toEqual(value);
  expect(await readExpoAndroidUpdate(async () => Response.json({ release: null }), code - 1, signal)).toBeNull();
  expect(await readExpoAndroidUpdate(async () => Response.json({ release: {
    tag: "app-v0.1.0", channel: "stable", downloads: { android: value.url },
  } }), code - 1, signal)).toBeNull();
  await expect(readExpoAndroidUpdate(async () => Response.redirect("https://another.example/", 302), code - 1, signal)).rejects.toThrow();
  await expect(readExpoAndroidUpdate(async () => Response.json({ release: value, filler: "x".repeat(4096) }), code - 1, signal)).rejects.toThrow("too large");
  await expect(readExpoAndroidUpdate(async () => Response.json({ release: { ...value, sha256: "bad" } }), code - 1, signal)).rejects.toThrow("invalid");
});

test("platform handoff is gated by an APK digest, verified signer and private read grant", () => {
  const source = readFileSync("apps/mobile-native/modules/zyx-android-updater/android/src/main/java/com/zyx/academy/updater/AndroidUpdaterModule.kt", "utf8");
  const manifest = readFileSync("apps/mobile-native/modules/zyx-android-updater/android/src/main/AndroidManifest.xml", "utf8");
  expect(source).toContain(`const val PACKAGE_NAME = "${EXPO_ANDROID_PACKAGE}"`);
  expect(source).toContain("result != sha || !verifyArchive");
  expect(source).toContain("result.isVerified && result.signerCertificates");
  expect(source).toContain("archive.versionName != version || versionCode(archive) != code.toLong()");
  expect(source).toContain("Intent.FLAG_GRANT_READ_URI_PERMISSION");
  expect(source).toContain("activity.hasWindowFocus()");
  expect(source).toContain("PackageManager.MATCH_SYSTEM_ONLY");
  expect(source).toContain("intent.setClassName(installer.packageName, installer.name)");
  expect(manifest).toContain('android:exported="false"');
});
