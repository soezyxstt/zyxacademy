import { describe, expect, test } from "bun:test";
import { link, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareProductDraftPreview } from "@/lib/authoring/product-draft-preview";
import { compileProductDiktatHtml } from "@/lib/bundle/product-diktat-pdf";
import { createDraftPreviewExample } from "../../scripts/authoring/preview-example";
import { assertDraftPreviewPaths, createDraftPreviewServer, draftPreviewSetupIssue, parseDraftPreviewArgs } from "../../scripts/authoring/preview-product-draft";
import type { ProductDraftInput } from "@/lib/authoring/product-draft-builder";
import { build } from "esbuild";

function standaloneDiktat(): ProductDraftInput {
  return { products: [{ productType: "diktat", title: "Pangkat", ideaIds: ["idea"], sourceRefs: [{ sourceId: "source", excerptIds: ["excerpt"] }],
    units: [{ ideaIds: ["idea"], parts: [{ kind: "math_unit", latex: "x^2", meaningMarkdown: "Hasil kali bilangan dengan dirinya." }] }],
  }] };
}

describe("offline product draft preview", () => {
  test("computes JSXGraph identity coordinates with string code execution disabled", async () => {
    const bundle = await build({
      stdin: { contents: `import JXG from './scripts/authoring/preview-graph-runtime';
        const interpreter = new JXG.JessieCode();
        interpreter.use({ options: JXG.Options, objects: {}, elementsByName: {}, groups: {} });
        const identity = interpreter.snippet('x', true, 'x', false);
        const curve = interpreter.snippet('2*x+1', true, 'x', false);
        console.log(JSON.stringify([-2, 0, 3, 6].map(x => [identity(x), curve(x)])));`, resolveDir: process.cwd() },
      bundle: true, write: false, format: "iife", minify: true, logLevel: "silent",
    });
    const child = Bun.spawn(["node", "--disallow-code-generation-from-strings", "-"], { stdin: new Blob([bundle.outputFiles[0].text]), stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    expect(JSON.parse(stdout)).toEqual([[-2, -3], [0, 1], [3, 7], [6, 13]]);
  });

  test("projects the exact typed author input without inventing source versions or admitting it", () => {
    const raw = createDraftPreviewExample();
    const original = structuredClone(raw);
    const preview = prepareProductDraftPreview(raw);
    expect(preview.checks).toEqual({ structure: "passed", references: "not_checked", publication: "not_evaluated", visualReview: "not_performed" });
    expect(preview.products.map(product => product.productType)).toEqual(["article", "diktat"]);
    expect(raw).toEqual(original);
    expect(preview).not.toHaveProperty("bundle");
    expect(preview).not.toHaveProperty("receipt");
    expect(JSON.stringify(preview.products)).not.toContain("sourceHash");
    expect(prepareProductDraftPreview(raw).inputHash).toBe(preview.inputHash);
    expect(preview.outline[0].units.some(unit => unit.kind === "topic" && unit.learningObjective)).toBe(true);
  });

  test("uses the learner read-model projection and preserves worked examples", () => {
    const preview = prepareProductDraftPreview(createDraftPreviewExample());
    const article = preview.products.find(product => product.productType === "article");
    if (article?.productType !== "article") throw new Error("Expected Article");
    const example = article.article.sections.flatMap(section => section.blocks).find(block => block.workedExample);
    expect(example?.workedExample?.steps.length).toBeGreaterThan(0);
    const check = article.article.sections.flatMap(section => section.blocks).find(block => block.formativeCheck);
    expect(check?.formativeCheck).not.toHaveProperty("answer");
    expect(preview.issues.some(issue => issue.code === "PREVIEW_SERVER_INTERACTIONS_NOT_TESTED")).toBe(true);
  });

  test("the long fixture places a typed lazy scene after the long article content", () => {
    const preview = prepareProductDraftPreview(createDraftPreviewExample(true));
    expect(preview.checks.structure).toBe("passed");
    const article = preview.products.find(product => product.productType === "article");
    if (article?.productType !== "article") throw new Error("Expected Article");
    expect(article.article.sections.at(-1)!.blocks.at(-1)!.visuals?.some(visual => visual.id === "preview_offscreen_scene")).toBe(true);
    expect(preview.outline[0].units.at(-1)!.parts.at(-1)).toEqual({ id: "preview-offscreen-part", kind: "visual_ref" });
  });

  test("runtime setup errors remain actionable and do not leak browser launch arguments", () => {
    const issue = draftPreviewSetupIssue(Object.assign(new Error("launch flags and local paths"), { code: "PREVIEW_BROWSER_UNAVAILABLE" }));
    expect(issue?.code).toBe("PREVIEW_BROWSER_UNAVAILABLE");
    expect(issue?.message).toContain("--executable-path");
    expect(issue?.message).not.toContain("launch flags");
    expect(draftPreviewSetupIssue(new Error("malformed draft"))).toBeNull();
  });

  test("assigns only local render IDs and compiles standalone Diktat through the production renderer", () => {
    const preview = prepareProductDraftPreview(standaloneDiktat());
    expect(preview.checks.structure).toBe("passed");
    const diktat = preview.products[0];
    if (diktat.productType !== "diktat") throw new Error("Expected Diktat");
    expect(diktat.source.diktat.units?.[0].parts[0].id).toBeTruthy();
    expect(diktat.source.diktat).not.toHaveProperty("sourceRefs");
    const output = compileProductDiktatHtml(diktat.source);
    expect(output).toContain("Pangkat");
    expect(output).toContain('class="katex');
  });

  test("keeps content refinements, part IDs, and local Diktat lineage strict", () => {
    const raw = standaloneDiktat();
    const product = raw.products[0];
    if (product.productType !== "diktat") throw new Error("Expected Diktat");
    product.units[0].parts = [{ kind: "math_unit", meaningMarkdown: "Incomplete" }];
    expect(prepareProductDraftPreview(raw).checks.structure).toBe("failed");
    const missing = standaloneDiktat();
    if (missing.products[0].productType !== "diktat") throw new Error("Expected Diktat");
    missing.products[0].sourceArticleId = "not-in-input";
    expect(prepareProductDraftPreview(missing).issues[0].message).toContain("PREVIEW_SOURCE_ARTICLE_NOT_IN_INPUT");
    const stale = createDraftPreviewExample();
    const diktat = stale.products.find(product => product.productType === "diktat");
    if (diktat?.productType !== "diktat") throw new Error("Expected Diktat");
    diktat.units[0].sourceElementRefs = ["missing-part"];
    expect(prepareProductDraftPreview(stale).checks.structure).toBe("failed");
  });

  test("reports invalid and oversized input before starting a browser", () => {
    expect(prepareProductDraftPreview(undefined).checks.structure).toBe("failed");
    expect(prepareProductDraftPreview({ products: [], token: "unexpected" }).checks.structure).toBe("failed");
    const tooLarge = standaloneDiktat();
    tooLarge.products[0].title = "x".repeat(530_000);
    expect(prepareProductDraftPreview(tooLarge).issues[0].message).toContain("PREVIEW_INPUT_TOO_LARGE");
    const duplicates = standaloneDiktat();
    duplicates.products[0].id = "same";
    duplicates.products.push(structuredClone(duplicates.products[0]));
    expect(prepareProductDraftPreview(duplicates).issues[0].code).toBe("PREVIEW_PRODUCT_ID_DUPLICATE");
  });

  test("does not read arbitrary files or accept writes on the local preview server", async () => {
    const prefix = `/${"a".repeat(32)}/`;
    const resources = new Map([["", { body: "preview", type: "text/html" }], ["article.json", { body: "{}", type: "application/json" }]]);
    const server = createDraftPreviewServer(resources, prefix);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Address required");
      const base = `http://127.0.0.1:${address.port}`;
      const allowed = await fetch(base + prefix);
      expect(await allowed.text()).toBe("preview");
      expect(allowed.headers.get("content-security-policy")).toContain("connect-src 'self'");
      expect(allowed.headers.get("content-security-policy")).not.toContain("unsafe-eval");
      expect(allowed.headers.get("access-control-allow-origin")).toBeNull();
      for (const route of ["/.env", `${prefix}../../package.json`, `${prefix}%2e%2e%2f.env`, "/article.json"]) expect((await fetch(base + route)).status).toBe(404);
      expect((await fetch(base + prefix, { method: "POST", body: "mutation" })).status).toBe(404);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  test("validates CLI options and keeps an explicit local browser override separate", () => {
    expect(parseDraftPreviewArgs(["--input", "draft.json", "--executable-path", "/usr/bin/chromium", "--watch"]).watch).toBe(true);
    expect(() => parseDraftPreviewArgs(["--input", "--watch"])).toThrow("PREVIEW_ARGUMENT_VALUE_REQUIRED");
    expect(() => parseDraftPreviewArgs(["--input", "a", "--example", "short"])).toThrow("PREVIEW_SELECT_INPUT_OR_EXAMPLE");
    expect(() => parseDraftPreviewArgs(["--host", "0.0.0.0"])).toThrow("PREVIEW_ARGUMENT_UNKNOWN");
  });

  test("rejects report paths, temporary paths, symlink aliases and hardlinks before writing", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "zyx-preview-paths-"));
    try {
      const input = path.join(directory, "draft.json");
      await writeFile(input, "source");
      await expect(assertDraftPreviewPaths(path.join(directory, "preview-report.json.tmp"), directory)).rejects.toThrow("PREVIEW_INPUT_OUTPUT_COLLISION");
      await link(input, path.join(directory, "outline.json"));
      await expect(assertDraftPreviewPaths(input, directory)).rejects.toThrow("PREVIEW_INPUT_OUTPUT_COLLISION");
      await rm(path.join(directory, "outline.json"));
      await symlink(input, path.join(directory, "preview-report.json"));
      await expect(assertDraftPreviewPaths(input, directory)).rejects.toThrow("PREVIEW_INPUT_OUTPUT_COLLISION");
      await rm(path.join(directory, "preview-report.json"));
      await symlink(directory, path.join(directory, "alias"));
      await expect(assertDraftPreviewPaths(path.join(directory, "alias", "outline.json"), directory)).rejects.toThrow("PREVIEW_INPUT_OUTPUT_COLLISION");
      expect(await readFile(input, "utf8")).toBe("source");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("a watch session recovers from malformed edits without retaining stale evidence", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "zyx-preview-test-"));
    const input = path.join(directory, "draft.json"), reportFile = path.join(directory, "preview-report.json");
    await writeFile(input, JSON.stringify(standaloneDiktat()));
    const child = Bun.spawn([process.execPath, "scripts/authoring/preview-product-draft.ts", "--input", input, "--out", directory, "--watch", "--check"], { stdout: "ignore", stderr: "pipe" });
    const waitFor = async (predicate: (report: { status: string; inputHash: string; metrics: { browserLaunches: number } }) => boolean) => {
      for (let attempt = 0; attempt < 160; attempt++) {
        try { const report = JSON.parse(await readFile(reportFile, "utf8")); if (predicate(report)) return report; } catch {}
        await Bun.sleep(35);
      }
      throw new Error("PREVIEW_WATCH_REPORT_TIMEOUT");
    };
    try {
      const first = await waitFor(report => report.status === "structure_ready");
      expect(first.metrics.browserLaunches).toBe(0);
      await writeFile(input, "{");
      await waitFor(report => report.status === "needs_changes");
      expect(JSON.parse(await readFile(path.join(directory, "outline.json"), "utf8"))).toEqual([]);
      const changed = standaloneDiktat(); changed.products[0].title = "Pangkat dua";
      await writeFile(input, JSON.stringify(changed));
      const recovered = await waitFor(report => report.status === "structure_ready" && report.inputHash !== first.inputHash);
      expect(recovered.metrics.browserLaunches).toBe(0);
      await writeFile(input, JSON.stringify(changed, null, 2));
      await Bun.sleep(750);
      expect(JSON.parse(await readFile(reportFile, "utf8")).inputHash).toBe(recovered.inputHash);
    } finally { child.kill("SIGTERM"); await child.exited; await rm(directory, { recursive: true, force: true }); }
  }, 20_000);
});
