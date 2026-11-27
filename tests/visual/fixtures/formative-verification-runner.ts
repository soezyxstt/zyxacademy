import { mock } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
mock.module("server-only", () => ({}));
mock.module("@/lib/storage", () => ({ storage: {} }));
const runtimeModule = await import("@/lib/compute/product-v4-runtime-binding");
const runtime = await runtimeModule.readProductV4RuntimeFingerprint();
if (process.argv[2] === "runtime") {
  process.stdout.write(JSON.stringify(runtime));
} else {
  const selectedUrl = process.argv[2];
  const output = process.argv[3];
  if (!selectedUrl || !output) throw new Error("FIXTURE_INPUT_REQUIRED");
  const url = new URL(selectedUrl);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/" || url.username || url.password || url.search || url.hash) throw new Error("FIXTURE_LOCAL_ORIGIN_REQUIRED");
  const baseUrl = url.origin;
  const [{ admittedFormativeVerificationFixture }, { formativeDocumentFields }, { chromium }, helper, { productV4DocumentPairKey }] = await Promise.all([
    import("./formative-verification-data"), import("@/lib/bundle/product-v4-verification"), import("playwright-core"), import("@/lib/compute/product-v4-formative-verification"), import("@/lib/compute/product-v4-document-wire"),
  ]);
  const { bundle, assets } = await admittedFormativeVerificationFixture();
  const fields = formativeDocumentFields(bundle.products);
  if (fields.length !== 4) throw new Error("FIXTURE_FIELD_COUNT_INVALID");
  const viewports = [{ width: 380, height: 844 }, { width: 1536, height: 864 }];
  await mkdir(output, { recursive: true });
  const results: Array<Awaited<ReturnType<typeof helper.executeFormativeDocumentCheck>> & { width: number; status: "PASS"; observed: string; paths: string[] }> = [];
  // This optional UI test uses local browser contexts and creates no publication receipt.
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    for (const field of fields) for (const viewport of viewports) {
      const name = field.field.startsWith("prompt:") ? "prompt" : field.field.startsWith("option:") ? "option" : field.field;
      const scope = randomBytes(16).toString("hex");
      const preview = JSON.stringify(helper.formativeVerificationPreview(field, scope));
      const explanation = fields.find(item => item.field === "explanation")!;
      if (preview.includes(explanation.spec.documentSha256) || ((name === "answer" || name === "explanation") && preview.includes(field.spec.documentSha256))) throw new Error("FIXTURE_HIDDEN_PREVIEW_EXPOSED");
      if (name === "answer" || name === "explanation") {
        const responses = helper.formativeVerificationResponses(field, "only-after-reveal");
        if (responses.handle("reveal", "POST", { articleId: "verification", articleVersion: 1, sectionId: field.section.id, blockId: "wrong" })) throw new Error("FIXTURE_WRONG_SCOPE_ACCEPTED");
      }
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "id-ID", colorScheme: "light" });
      try {
        const errors: string[] = [];
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        page.on("response", response => { if (response.status() >= 400) errors.push(`HTTP_${response.status()}`); });
        await context.route("**/*", async route => {
          const requested = new URL(route.request().url());
          if (route.request().frame() !== page.mainFrame()) { errors.push("UNEXPECTED_DOCUMENT_REQUEST"); await route.abort(); }
          else if (requested.origin === baseUrl || requested.protocol === "data:") await route.continue();
          else { errors.push("UNEXPECTED_EXTERNAL_REQUEST"); await route.abort(); }
        });
        const response = await page.goto(`${baseUrl}/authoring-verification`, { waitUntil: "networkidle" });
        if (response?.status() !== 200 || new URL(page.url()).pathname !== "/authoring-verification") throw new Error("FIXTURE_PREVIEW_REDIRECT");
        await page.waitForSelector("html[data-verification-ready='true']", { state: "attached" });
        const pageRuntime = await page.locator("html").getAttribute("data-verification-runtime");
        if (!pageRuntime) throw new Error("FIXTURE_WEB_RUNTIME_MISSING");
        runtimeModule.assertProductV4RuntimeFingerprint(runtime, JSON.parse(pageRuntime));
        const observation = await helper.executeFormativeDocumentCheck(page, baseUrl, field, assets[productV4DocumentPairKey(field.spec)], scope);
        await page.evaluate(async () => { await document.fonts.ready; });
        if (errors.length) throw new Error(`FIXTURE_BROWSER_ERRORS:${errors.join(",")}`);
        const path = join(output, `${name}-${viewport.width}.png`);
        await writeFile(path, await page.screenshot({ fullPage: true, animations: "disabled" }));
        results.push({ ...observation, width: viewport.width, status: "PASS", observed: name === "answer" || name === "explanation" ? "Optional UI regression passed with a scoped simulated reveal." : "Optional UI regression passed with a public formative field.", paths: [path] });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  process.stdout.write(JSON.stringify(results));
}
