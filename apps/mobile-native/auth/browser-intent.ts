export const NATIVE_BROWSER_SCHEME = "zyx-native-parity";
export const NATIVE_BROWSER_FINISH_PATH = "/auth/native-finish";
export const NATIVE_BROWSER_REDIRECT = `${NATIVE_BROWSER_SCHEME}://auth/native-finish`;

export type NativeBrowserCallback = Readonly<{ code: string; state: string }>;

export function parseNativeBrowserCallback(path: string): NativeBrowserCallback | null {
  if (!path.startsWith(`${NATIVE_BROWSER_REDIRECT}#`) || path.length > 2300) return null;
  const params = new URLSearchParams(path.slice(NATIVE_BROWSER_REDIRECT.length + 1));
  const code = params.get("code");
  const state = params.get("state");
  let pairs = 0;
  params.forEach(() => { pairs++; });
  if (pairs !== 2 || params.getAll("code").length !== 1 || params.getAll("state").length !== 1
    || !code || !/^[a-f0-9]{2,1024}$/.test(code) || !state || !/^[a-f0-9]{48}$/.test(state)) return null;
  return { code, state };
}

let pendingCallback: NativeBrowserCallback | null = null;

export function rewriteNativeBrowserIntent(path: string): string {
  if (path !== NATIVE_BROWSER_REDIRECT && !path.startsWith(`${NATIVE_BROWSER_REDIRECT}#`) && !path.startsWith(`${NATIVE_BROWSER_REDIRECT}?`)) {
    return path;
  }
  const callback = parseNativeBrowserCallback(path);
  if (callback) pendingCallback = callback;
  return NATIVE_BROWSER_FINISH_PATH;
}

export function takeNativeBrowserCallback(): NativeBrowserCallback | null {
  const callback = pendingCallback;
  pendingCallback = null;
  return callback;
}
