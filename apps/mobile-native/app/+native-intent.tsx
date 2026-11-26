import { rewriteNativeBrowserIntent } from "../auth/browser-intent";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return rewriteNativeBrowserIntent(path);
}
