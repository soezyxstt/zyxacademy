import { existsSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

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

type PdfBrowser = Pick<Browser, "close"> & {
  newPage(): Promise<Pick<Page, "setContent" | "pdf">>;
};

/** Retry only a stalled browser operation, never an assertion or an invalid PDF. */
export async function renderContractPdf(html: string, options: {
  launch?: () => Promise<PdfBrowser>;
  renderTimeoutMs?: number;
} = {}): Promise<Uint8Array> {
  const launch = options.launch ?? (() => chromium.launch({
    executablePath: contractChromiumPath(), headless: true, timeout: 15_000, args: ["--no-sandbox"],
  }));
  const timeoutMs = options.renderTimeoutMs ?? 10_000;
  for (let attempt = 0; attempt < 2; attempt++) {
    const browser = await launch();
    const stalled = new Error("CONTRACT_PDF_RENDER_TIMEOUT");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return new Uint8Array(await Promise.race([
        (async () => {
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: "load", timeout: timeoutMs });
          return page.pdf({ format: "A4", printBackground: true });
        })(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(stalled), timeoutMs); }),
      ]));
    } catch (error) {
      if (error !== stalled || attempt === 1) throw error;
    } finally {
      clearTimeout(timer);
      await browser.close();
    }
  }
  throw new Error("CONTRACT_PDF_RENDER_TIMEOUT");
}
