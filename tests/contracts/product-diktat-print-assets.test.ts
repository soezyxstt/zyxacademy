import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { buildSelfContainedKatexCss, PRODUCT_DIKTAT_FOOTER_TEMPLATE } from "@/lib/bundle/product-diktat-pdf";
import worker from "../../workers/diktat-renderer/src/index";

test("KaTeX assets resolve outside the repository working directory", () => {
  const original = process.cwd();
  try {
    process.chdir(tmpdir());
    const css = buildSelfContainedKatexCss();
    expect(css).toContain("font-family:KaTeX_Main");
    expect(css).toContain("data:font/woff2;base64,");
    expect(css).not.toContain("url(fonts/");
    expect((css.match(/data:font\/woff2/g) || []).length).toBeGreaterThan(10);
  } finally { process.chdir(original); }
});

test("renderer places supplied contacts in the PDF footer with no default header", async () => {
  let captured: any;
  const response = await worker.fetch(new Request("https://renderer.test/render", {
    method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    body: JSON.stringify({html:"<p>PDF</p>",printProfile:"a4-self-study-readable-v3",footerTemplate:PRODUCT_DIKTAT_FOOTER_TEMPLATE}),
  }), {SHARED_SECRET:"test",BROWSER:{quickAction:async (_action, options) => {captured=options;return new Response("%PDF-");}}});
  expect(response.status).toBe(200);
  expect(captured.pdfOptions).toMatchObject({displayHeaderFooter:true,headerTemplate:"<span></span>",footerTemplate:PRODUCT_DIKTAT_FOOTER_TEMPLATE,preferCSSPageSize:true});
});
