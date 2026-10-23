import { verificationBrowserProvider, verificationBrowserIdentity } from "../../lib/compute/product-v4-browser-config";
import { acquireConfiguredVerificationBrowser, runVerificationBrowserOperation } from "../../lib/compute/product-v4-browser-session";

let stage = "acquire";
async function main() {
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!["https://www.zyxacademy.com", "https://staging.zyxacademy.com"].includes(origin ?? "")) throw new Error("VERIFICATION_BROWSER_ORIGIN_INVALID");
  const session = await acquireConfiguredVerificationBrowser();
  await runVerificationBrowserOperation(async () => {
    console.log(JSON.stringify({ probe: "cdp", browserVersion: session.browser.version() }));
    const pin = verificationBrowserProvider() === "cloudflare" || process.env.AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION ? verificationBrowserIdentity().browserVersion : undefined;
    if (pin && session.browser.version() !== pin) throw new Error("PRODUCT_V4_BROWSER_VERSION_MISMATCH");
    stage = "context";
    const context = await session.browser.newContext({ viewport: { width: 380, height: 844 } });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      stage = "preview";
      const response = await page.goto(`${origin}/authoring-verification`, { waitUntil: "networkidle" });
      if (response?.status() !== 200 || new URL(page.url()).pathname !== "/authoring-verification") throw new Error("VERIFICATION_PREVIEW_REDIRECT");
      await page.waitForSelector("html[data-verification-ready='true']", { state: "attached" });
      if (!await page.locator("html").getAttribute("data-verification-runtime") || !await page.locator("main[data-verification-empty]").count()) throw new Error("VERIFICATION_PROBE_PREVIEW_INVALID");
      console.log(JSON.stringify({ probe: "preview", httpStatus: response.status(), attested: true }));
      stage = "screenshot";
      const bytes = await page.screenshot();
      console.log(JSON.stringify({ probe: "screenshot", byteLength: bytes.byteLength }));
      stage = "pdf";
      const pdf = await page.pdf({ format: "A4", printBackground: true });
      if (pdf.byteLength < 5 || pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("VERIFICATION_PROBE_PDF_INVALID");
      console.log(JSON.stringify({ probe: "pdf", byteLength: pdf.byteLength }));
    } finally { await context.close(); }
  }, () => session.close());
  console.log(JSON.stringify({ probe: "cdp-cleanup", complete: true }));
}
main().catch(error => {
  console.error(JSON.stringify({ stage, code: error instanceof Error && /^[A-Z0-9_:]+$/.test(error.message) ? error.message : "VERIFICATION_BROWSER_PROBE_FAILED" }));
  process.exitCode = 1;
});
