import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

let fixture: typeof import("./fixtures/product-v4-interaction-verification");

test.beforeAll(async ({}, info) => {
  const output = info.outputPath("interaction-runner.mjs");
  await build({ entryPoints: ["tests/visual/fixtures/product-v4-interaction-verification.ts"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", banner: { js: "import {createRequire as fixtureRequire} from 'node:module'; const require = fixtureRequire(import.meta.url);" }, plugins: [{ name: "fixture-boundaries", setup(builder) {
    builder.onResolve({ filter: /^(server-only|@\/lib\/storage)$/ }, args => ({ path: args.path, namespace: "fixture-boundary" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture-boundary" }, args => ({ contents: args.path === "server-only" ? "" : "export const storage={}", loader: "js" }));
  } }] });
  process.env.SKIP_ENV_VALIDATION = "1";
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@127.0.0.1:1/placeholder";
  process.env.ZYX_POSTGRES_BUILD_PLACEHOLDER = "1";
  fixture = await import(pathToFileURL(output).href);
});

for (const lane of ["article", "formative"] as const) {
  for (const mode of ["noop", "canvas", "pressed", "focus-svg", "focus-canvas", "focus-aria", "delayed-reset"] as const) {
    test(`${lane} ${mode} interaction and reset`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      const { spec, field, assets } = await fixture.interactionFixture(mode);
      const scope = "b".repeat(32), baseUrl = "http://fixture.test";
      const query = new URLSearchParams({ courseId: "verification", articleId: "verification", articleVersion: "1", sectionId: field.section.id, blockId: field.block.id, field: "markdown", partId: "interaction-part", visualId: spec.id, hash: spec.documentSha256, kind: "document", checksum: scope });
      const source = lane === "formative" ? `${baseUrl}/api/admin/bundles/product/${scope}/interactive-document?${query}` : `${baseUrl}/document`;
      await page.route(`${baseUrl}/**`, route => route.fulfill(route.request().url() === `${baseUrl}/document` ? { status: 200, contentType: "text/html", body: assets.document } : { status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
      await page.goto(baseUrl);
      await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main><div data-part-id="interaction-part"><figure data-interactive-document id="${spec.id}"><span>${spec.label}</span><p>${spec.staticFallback.summary}</p><button type="button">Buka visual</button></figure></div></main><div data-verification-loaded>Siap</div></body></html>`);
      await page.evaluate(url => {
        const host = document.querySelector("figure[data-interactive-document]")!;
        let opens = 0;
        host.querySelector("button")!.addEventListener("click", event => {
          const button = event.currentTarget as HTMLButtonElement;
          const frame = host.querySelector("iframe");
          if (frame) { frame.remove(); button.textContent = "Buka visual"; }
          else { const iframe = document.createElement("iframe"); iframe.name = opens++ ? "reset" : "initial"; iframe.setAttribute("sandbox", "allow-scripts"); iframe.setAttribute("inert", ""); iframe.addEventListener("load", () => iframe.removeAttribute("inert"), { once: true }); iframe.src = url; host.append(iframe); button.textContent = "Tutup visual"; }
        });
      }, source);
      const result = lane === "formative"
        ? fixture.executeFormativeDocumentCheck(page, baseUrl, field, assets, scope)
        : fixture.exerciseProductV4VisualSmoke(page, spec);
      if (mode === "noop" || mode.startsWith("focus-")) await expect(result).rejects.toThrow("VERIFICATION_VISUAL_STATE_UNSUPPORTED:keyboard-change");
      else if (mode === "delayed-reset") await expect(result).rejects.toThrow("VERIFICATION_RESET_FAILED");
      else {
        await expect(result).resolves.toBeTruthy();
        await expect(page.locator("main figure[data-interactive-document] > button")).toHaveText(lane === "article" ? "Buka visual" : "Tutup visual");
      }
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(page.viewportSize()!.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      const screenshot = info.outputPath(`${lane}-${mode}.png`);
      await page.screenshot({ path: screenshot });
      await info.attach(`${lane}-${mode}-${info.project.name}`, { path: screenshot, contentType: "image/png" });
    });
  }
}
