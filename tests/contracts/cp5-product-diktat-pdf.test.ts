import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser } from "playwright";
import type { ArticleDocument } from "@/lib/materials/article-contract";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import {
  compileProductDiktatHtml,
  inspectProductDiktatPdf,
  PRODUCT_DIKTAT_PRINT_PROFILE,
  canDownloadProductDiktat,
  productDiktatFailureCode,
} from "@/lib/bundle/product-diktat-pdf";
import { LIMIT_ARTICLE_FIXTURE } from "../fixtures/product-learning/limit-epsilon-delta";
import { EIGENVALUES_ARTICLE_FIXTURE } from "../fixtures/product-learning/eigenvalues";
import { TCP_HANDSHAKE_ARTICLE_FIXTURE } from "../fixtures/product-learning/tcp-handshake";
import { isProtectedProductDiktatPdfKey } from "@/lib/storage/keys";

const HASH = "a".repeat(64);
let browser: Browser;

function articleProduct(document: ArticleDocument): Extract<ProductEntity, { productType: "article" }> {
  const sourceRefs = document.sections[0]?.sourceRefs ?? [];
  return {
    id: document.id,
    productType: "article",
    slug: document.id,
    title: document.title,
    courseId: document.courseId,
    chapterId: document.sections.find((section) => section.kind === "topic")?.id ?? document.sections[0]?.id,
    version: document.version,
    status: "draft",
    ideaLinks: document.ideaIds.map((id) => ({ id, version: 1, semanticHash: HASH, weight: 1, role: "primary" as const })),
    sourceRefs,
    schemaVersion: "1.0",
    sourceHash: sourceRefs[0]?.checksum ?? HASH,
    generationHash: document.generationHash,
    creatorId: "fixture-author",
    blocks: [],
    sections: document.sections.map((section) => ({
      id: section.id,
      kind: section.kind,
      learningSectionId: section.kind === "topic" ? section.learningSectionId : undefined,
      parentSectionId: section.parentSectionId,
      title: section.title,
      slug: section.slug,
      orderIndex: section.orderIndex,
      learningObjective: section.learningObjective,
      ideaIds: section.ideaIds,
      sourceRefs: section.sourceRefs,
      pedagogy: section.pedagogy,
      blocks: section.blocks.map((block) => ({
        id: block.id,
        blockType: block.blockType,
        title: block.title,
        orderIndex: block.orderIndex,
        contentMarkdown: block.content,
        ideaIds: block.ideaIds,
        sourceRefs: block.sourceRefs,
        workedExamplePayload: block.workedExamplePayload,
        formativeCheckPayload: block.formativeCheckPayload,
      })),
    })),
    visuals: document.visuals,
  };
}

function diktatProduct(article: Extract<ProductEntity, { productType: "article" }>, formula: string): Extract<ProductEntity, { productType: "diktat" }> {
  return {
    id: `diktat-${article.id}`,
    productType: "diktat",
    title: `Diktat ${article.title}`,
    courseId: article.courseId,
    chapterId: article.chapterId,
    version: 1,
    status: "draft",
    ideaLinks: structuredClone(article.ideaLinks),
    sourceRefs: structuredClone(article.sourceRefs),
    schemaVersion: "1.0",
    sourceHash: article.sourceHash,
    generationHash: HASH,
    creatorId: "fixture-author",
    contentMarkdown: `Ringkasan mandiri dengan rumus utama $$${formula}$$ beserta syarat penerapannya.`,
    sourceArticleId: article.id,
    sourceArticleVersion: article.version,
    sourceArticleHash: article.generationHash,
  };
}

async function realPdf(html: string): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}

async function savePdfPages(name: string, bytes: Uint8Array): Promise<void> {
  const directory = path.resolve("artifacts/product-bundle-self-study/cp5", name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${name}.pdf`), bytes);
  const { PDFParse } = await import("pdf-parse");
  PDFParse.setWorker(pathToFileURL(path.resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")).href);
  const parser = new PDFParse({ data: bytes });
  try {
    const screenshots = await parser.getScreenshot({ desiredWidth: 1280, imageBuffer: true });
    for (const page of screenshots.pages) {
      await writeFile(path.join(directory, `page-${page.pageNumber}.png`), page.data);
    }
  } finally {
    await parser.destroy();
  }
}

before(async () => {
  browser = await chromium.launch({
    executablePath: "/home/soezyxst/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
});

after(async () => {
  await browser?.close();
});

describe("CP5 Product Bundle Diktat PDF", () => {
  const fixtures = [
    [LIMIT_ARTICLE_FIXTURE, "\\delta=\\varepsilon/2"],
    [EIGENVALUES_ARTICLE_FIXTURE, "Av=\\lambda v"],
    [TCP_HANDSHAKE_ARTICLE_FIXTURE, "ACK=ISN+1"],
  ] as const;

  for (const [fixture, formula] of fixtures) {
    test(`renders a real two-page PDF for ${fixture.id}`, async () => {
      const article = articleProduct(fixture);
      const diktat = diktatProduct(article, formula);
      const html = compileProductDiktatHtml({ article, diktat });
      assert.match(html, /katex/);
      assert.doesNotMatch(html, new RegExp(article.ideaLinks[0].id));
      const bytes = await realPdf(html);
      assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
      const inspected = await inspectProductDiktatPdf(bytes);
      assert.equal(inspected.pageCount, 2);
      assert.match(inspected.text, /Pokok gagasan 1/);
      assert.doesNotMatch(inspected.text, new RegExp(article.ideaLinks[0].id));
      assert.doesNotMatch(inspected.text, /\[object Object\]/);
      await savePdfPages(article.id, bytes);
    });
  }

  test("fails closed when the Article lineage is stale", () => {
    const article = articleProduct(LIMIT_ARTICLE_FIXTURE);
    const diktat = { ...diktatProduct(article, "x=1"), sourceArticleHash: "b".repeat(64) };
    assert.throws(() => compileProductDiktatHtml({ article, diktat }), /PRODUCT_DIKTAT_LINEAGE_MISMATCH/);
  });

  test("uses an explicit reproducible print profile", () => {
    assert.equal(PRODUCT_DIKTAT_PRINT_PROFILE, "a4-self-study-2-page-v1");
  });

  test("allows only admin preview or an enrolled student download", () => {
    assert.equal(canDownloadProductDiktat({ role: "admin", enrolled: false }), true);
    assert.equal(canDownloadProductDiktat({ role: "student", enrolled: true }), true);
    assert.equal(canDownloadProductDiktat({ role: "student", enrolled: false }), false);
    assert.equal(canDownloadProductDiktat({ role: "tutor", enrolled: true }), false);
    assert.equal(isProtectedProductDiktatPdfKey("overhaul/import-1/diktat-pdf/diktat-abc.pdf"), true);
    assert.equal(isProtectedProductDiktatPdfKey("courses/public/material.pdf"), false);
  });

  test("maps renderer failures to safe recoverable evidence codes", () => {
    assert.equal(productDiktatFailureCode(new Error("PRODUCT_DIKTAT_FORMULA_RENDER_ERROR")), "FORMULA_RENDER_ERROR");
    assert.equal(productDiktatFailureCode(new Error("PRODUCT_DIKTAT_PAGE_BUDGET_EXCEEDED")), "PAGE_BUDGET_EXCEEDED");
    assert.equal(productDiktatFailureCode(new Error("PRODUCT_DIKTAT_STORAGE_UNAVAILABLE")), "STORAGE_UNAVAILABLE");
    assert.equal(productDiktatFailureCode(new Error("PRODUCT_DIKTAT_RENDERER_UNAVAILABLE")), "RENDER_UNAVAILABLE");
    assert.equal(productDiktatFailureCode(Object.assign(new Error("aborted"), { name: "TimeoutError" })), "RENDER_TIMEOUT");
  });
});
