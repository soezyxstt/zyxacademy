import { newerExpoAndroidRelease, parseExpoAndroidRelease } from "../../../packages/native-session/expo-android-update";
import { NATIVE_STAGING_ORIGIN } from "../auth/session-api";

export const expoAndroidUpdateEndpoint = `${NATIVE_STAGING_ORIGIN}/api/app/latest?target=expo-android`;
type FetchUpdate = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "redirected" | "type" | "url" | "body" | "headers">>;

export async function readExpoAndroidUpdate(fetcher: FetchUpdate, versionCode: number, signal: AbortSignal) {
  if (signal.aborted) throw new Error("Update cancelled.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 15_000);
  try {
    const response = await fetcher(expoAndroidUpdateEndpoint, {
      signal: controller.signal, credentials: "omit", redirect: "manual",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    });
    if (!response.ok || response.redirected || response.type === "opaqueredirect"
      || (response.url && response.url !== expoAndroidUpdateEndpoint)
      || response.headers.get("content-type")?.split(";")[0] !== "application/json") {
      void response.body?.cancel().catch(() => {});
      throw new Error("Release metadata unavailable.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Release metadata unavailable.");
    const bytes = new Uint8Array(4096);
    let size = 0;
    let complete = false;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) { complete = true; break; }
        if (next.value.length > bytes.length - size) throw new Error("Release metadata is too large.");
        bytes.set(next.value, size);
        size += next.value.length;
      }
    } finally {
      if (!complete) void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (controller.signal.aborted) throw new Error("Update cancelled.");
    const result: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)));
    if (!result || typeof result !== "object" || !("release" in result)) throw new Error("Release metadata unavailable.");
    if (result.release === null) return null;
    // An older server may ignore target and return the legacy Capacitor/Tauri projection.
    const legacy = result.release;
    if (legacy && typeof legacy === "object" && "channel" in legacy
      && (legacy.channel === "stable" || legacy.channel === "nightly") && "tag" in legacy
      && typeof legacy.tag === "string" && legacy.tag.startsWith("app-v") && "downloads" in legacy) return null;
    const release = parseExpoAndroidRelease(result.release);
    if (!release) throw new Error("Release metadata invalid.");
    return newerExpoAndroidRelease(release, versionCode);
  } finally {
    signal.removeEventListener("abort", abort);
    clearTimeout(timeout);
  }
}
