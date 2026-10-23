import { acquireVerificationBrowser } from "@/lib/compute/product-v4-browser-session";
import { RetryAfterError } from "inngest";
import { chromium } from "playwright-core";

let stage = "acquire";
async function main() {
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!["https://www.zyxacademy.com", "https://staging.zyxacademy.com"].includes(origin ?? "")) throw new Error("VERIFICATION_BROWSER_ORIGIN_INVALID");
  const acquire = async () => {
    for (let attempt = 0; ; attempt++) {
      try { return await acquireVerificationBrowser(process.env.CF_ACCOUNT_ID ?? "", process.env.CF_API_TOKEN ?? "", { fetch, connect: async (endpoint: string, options?: Parameters<typeof chromium.connectOverCDP>[1]) => {
        try { return await chromium.connectOverCDP(endpoint, options); }
        catch (error) {
          const token = process.env.CF_API_TOKEN ?? "";
          const message = error instanceof Error ? error.message : "CDP_CONNECTION_FAILED";
          console.error(JSON.stringify({ probe: "cdp-error", message: message.replaceAll(token, "[redacted]").replace(/https?:\/\/[^\s"<>]+|wss:\/\/[^\s"<>]+/g, "[url]").slice(0, 2000) }));
          throw error;
        }
      } }); }
      catch (error) {
        if (!(error instanceof RetryAfterError) || attempt >= 2) throw error;
        console.log(JSON.stringify({ probe: "cdp-retry", attempt: attempt + 1, delaySeconds: Number(error.retryAfter) }));
        await new Promise(resolve => setTimeout(resolve, Number(error.retryAfter) * 1000));
      }
    }
  };
  const session = await acquire();
  try {
    console.log(JSON.stringify({ probe: "cdp", browserVersion: session.browser.version() }));
    stage = "context";
    const context = await session.browser.newContext({ viewport: { width: 380, height: 844 } });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      stage = "preview";
      const response = await page.goto(`${origin}/authoring-verification`, { waitUntil: "networkidle" });
      await page.waitForSelector("html[data-verification-ready='true']", { state: "attached" });
      console.log(JSON.stringify({ probe: "preview", httpStatus: response?.status(), attested: Boolean(await page.locator("html").getAttribute("data-verification-runtime")) }));
      stage = "screenshot";
      const bytes = await page.screenshot();
      console.log(JSON.stringify({ probe: "screenshot", byteLength: bytes.byteLength }));
    } finally { await context.close(); }
  } finally { await session.close(); }
  console.log(JSON.stringify({ probe: "cdp-cleanup", complete: true }));
}
main().catch(error => {
  console.error(JSON.stringify({ stage, code: error instanceof Error && /^[A-Z0-9_:]+$/.test(error.message) ? error.message : "VERIFICATION_BROWSER_PROBE_FAILED" }));
  process.exitCode = 1;
});
