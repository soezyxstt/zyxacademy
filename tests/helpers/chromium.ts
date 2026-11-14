import { existsSync } from "node:fs";
import { chromium, errors, type Browser, type Page } from "playwright";

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

type PdfPage = Pick<Page, "setContent" | "pdf" | "close">;
type PdfBrowser = Pick<Browser, "close"> & {
  newPage(): Promise<PdfPage>;
};
type StageLogger = (stage: string) => void;

async function boundedCleanup(operation: () => Promise<void>, timeoutMs: number, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`CONTRACT_PDF_${label}_CLOSE_TIMEOUT`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Reuse a browser across sequential PDFs, isolating each render in a fresh page. */
export function createContractPdfRenderer(options: {
  launch?: () => Promise<PdfBrowser>;
  renderTimeoutMs?: number;
  cleanupTimeoutMs?: number;
} = {}) {
  const launch = options.launch ?? (() => chromium.launch({
    executablePath: contractChromiumPath(), headless: true, timeout: 15_000, args: ["--no-sandbox"],
  }));
  const timeoutMs = options.renderTimeoutMs ?? 10_000;
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 2_000;
  let browser: PdfBrowser | undefined;
  let cleanupFailure: unknown;
  let unusable = false;

  async function closeBrowser(log: StageLogger = () => {}): Promise<void> {
    if (!browser) return;
    const closing = browser;
    browser = undefined;
    log("browser close started");
    try {
      await boundedCleanup(() => closing.close(), cleanupTimeoutMs, "BROWSER");
      log("browser close completed");
    } catch (error) {
      // Do not launch another browser if the previous one could still be alive.
      cleanupFailure = error;
      unusable = true;
      throw error;
    }
  }

  async function render(html: string, log: StageLogger = () => {}): Promise<Uint8Array> {
    if (unusable) throw new Error("CONTRACT_PDF_RENDERER_CLEANUP_FAILED", { cause: cleanupFailure });
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!browser) {
        log(`browser launch started (attempt ${attempt + 1})`);
        try {
          browser = await launch();
          log("browser launch completed");
        } catch (error) {
          if (!(error instanceof errors.TimeoutError) || attempt === 1) throw error;
          log("browser launch timed out, retrying");
          continue;
        }
      }

      let stage = "newPage";
      let timedOut = false;
      let page: PdfPage | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const bytes = await Promise.race([
          (async () => {
            log("newPage started");
            page = await browser!.newPage();
            if (timedOut) return;
            log("newPage completed");
            stage = "setContent";
            log("setContent started");
            await page.setContent(html, { waitUntil: "load", timeout: timeoutMs });
            if (timedOut) return;
            log("setContent completed");
            stage = "pdf";
            log("pdf started");
            const result = await page.pdf({ format: "A4", printBackground: true });
            if (timedOut) return;
            log("pdf completed");
            return result;
          })(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              reject(new Error(`CONTRACT_PDF_RENDER_TIMEOUT:${stage}`));
            }, timeoutMs);
          }),
        ]);
        clearTimeout(timer);
        log("page close started");
        await boundedCleanup(() => page!.close(), cleanupTimeoutMs, "PAGE");
        log("page close completed");
        return new Uint8Array(bytes!);
      } catch (error) {
        clearTimeout(timer);
        try {
          await closeBrowser(log);
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], `CONTRACT_PDF_RENDER_AND_CLEANUP_FAILED: ${String(error)}; ${String(cleanupError)}`);
        }
        if (!timedOut || attempt === 1) throw error;
        log(`render timed out at ${stage}, retrying`);
      }
    }
    throw new Error("CONTRACT_PDF_RENDER_TIMEOUT");
  }

  return { render, close: closeBrowser };
}
