import { existsSync } from "node:fs";
import { chromium } from "playwright";

/** Prefer the pinned browser; hosted CI can also provide an installed Chrome binary. */
export function contractChromiumPath(
  managedPath = chromium.executablePath(),
  configuredPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  exists: (path: string) => boolean = existsSync,
) {
  if (configuredPath) {
    if (!exists(configuredPath)) throw new Error("Configured contract Chromium executable does not exist");
    return configuredPath;
  }
  const candidates = [managedPath, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/opt/google/chrome/chrome"];
  const executablePath = candidates.find(path => exists(path));
  if (!executablePath) throw new Error("Chromium is required for PDF contracts. Run bun run test:visual:install");
  return executablePath;
}
