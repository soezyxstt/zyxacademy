import { contractChromiumPath } from "../helpers/chromium";
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
  compileCanonicalDiktatHtml,
  parseCanonicalDiktatMarkdownToHtml,
  PRODUCT_DIKTAT_PRINT_PROFILE,
  PRODUCT_DIKTAT_FOOTER_TEMPLATE,
  canDownloadProductDiktat,
} from "@/lib/bundle/product-diktat-pdf";
import {
  inspectProductDiktatPdf,
  productDiktatFailureCode,
} from "@/lib/compute/product-diktat-inspector";
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

function generateDiktatContent(formula: string): string {
  return [
    `# Diktat Mandiri\n\nRingkasan mandiri dengan rumus utama $$${formula}$$ beserta syarat penerapannya secara komprehensif.`,
    `### Konsep Dasar dan Formulasi Formal\n\nKonsep ini menjabarkan hubungan analitis antara peubah bebas dan peubah terikat dalam ruang keadaan terdefinisi. Berdasarkan relasi kanonik, setiap perubahan kecil pada parameter mematuhi invariant utama:\n\n- Persamaan pengatur: $$${formula}$$.\n- Batas nilai kekonvergenan ditentukan oleh kestabilan lokal dari matriks transisi terkait.\n- Evaluasi galat asimptotik menunjukkan pengurangan bertahap pada setiap siklus komputasi.`,
    `### Analisis Kondisi Batas dan Kestabilan\n\nKondisi singularitas dihindari dengan menetapkan batas keteraturan pada domain operasi. Jika determinan sistem bernilai tak-nol, eksistensi dan ketunggalan solusi dijamin pada seluruh interval yang ditinjau.\n\nContoh kasus batas menunjukkan bahwa deviasi linier tidak memicu instabilitas tak terkontrol.`,
    `### Prosedur Komputasi Terstruktur\n\nLangkah-langkah evaluasi numerik disusun sebagai berikut:\n\n1. Inisialisasi peubah keadaan awal sesuai batas toleransi.\n2. Hitung nilai residu terhadap formula utama $$${formula}$$.\n3. Terapkan koreksi terarah hingga kriteria henti terpenuhi.\n4. Verifikasi kestabilan akhir untuk memastikan akurasi hasil kalkulasi.`,
    `### Penerapan Praktis dan Diskusi Kasus\n\nDalam konteks terapan, pendekatan ini meminimalkan overhead komputasi tanpa mengurangi ketelitian analitik. Validasi numerik mengonfirmasi bahwa nilai estimasi berada di dalam ambang batas toleransi yang dipersyaratkan.`,
    `### Latihan Mandiri dan Evaluasi Reflektif\n\nDiskusikan pengaruh variasi parameter terhadap spektrum nilai eigen sistem. Bagaimana penyesuaian bobot dapat memulihkan performa nominal pada rezim transien?`,
  ].join("\n\n");
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
    contentMarkdown: Array.from({ length: 4 }, () => generateDiktatContent(formula)).join("\n\n"),
    sourceArticleId: article.id,
    sourceArticleVersion: article.version,
    sourceArticleHash: article.generationHash,
  };
}

async function realPdf(html: string): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: PRODUCT_DIKTAT_FOOTER_TEMPLATE });
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
    executablePath: contractChromiumPath(),
    args: ["--no-sandbox"],
  });
});

after(async () => {
  await browser?.close();
});

describe("CP5 Product Bundle Diktat PDF", () => {
  test("legacy canonical review markers force a real PDF page boundary", async () => {
    const { PDFParse } = await import("pdf-parse");
    PDFParse.setWorker(pathToFileURL(path.resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")).href);
    for (const viewport of [{ width: 380, height: 844 }, { width: 1536, height: 864 }]) {
      const page = await browser.newPage({ viewport });
      await page.emulateMedia({ media: "print" });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("response", response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}`); });
      let bytes: Uint8Array;
      try {
        await page.setContent(compileCanonicalDiktatHtml("Review", "Pertanyaan\n\n<!-- page-break -->\n\n## Kunci jawaban\nJawaban ringkas."), { waitUntil: "load" });
        assert.deepEqual(await page.locator(".diktat-running-header,.diktat-running-footer").evaluateAll(elements => elements.map(element => getComputedStyle(element).display)), ["none", "none"]);
        bytes = new Uint8Array(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
      const parser = new PDFParse({ data: bytes });
      try {
        const text = await parser.getText();
        assert.equal(text.pages.length, 2);
        assert.match(text.pages[0].text, /Pertanyaan/);
        assert.doesNotMatch(text.pages[0].text, /Kunci jawaban/);
        assert.match(text.pages[1].text, /Kunci jawaban/);
        const directory = path.resolve("artifacts/visual-quality/results/canonical-review-break", String(viewport.width));
        await mkdir(directory, { recursive: true });
        const screenshots = await parser.getScreenshot({ desiredWidth: viewport.width, imageBuffer: true });
        for (const shot of screenshots.pages) await writeFile(path.join(directory, `page-${shot.pageNumber}.png`), shot.data);
      } finally { await parser.destroy(); }
    }
  });
  test("a multi-page Diktat starts its body on the title page", async () => {
    const article = articleProduct(LIMIT_ARTICLE_FIXTURE);
    const diktat = diktatProduct(article, "x^2");
    diktat.contentMarkdown = Array.from({ length: 24 }, (_, i) => `## Konsep ${i + 1}\n\nPenanda isi ${i + 1}. ${"Periksa domain sebelum menggunakan rumus dan substitusikan hasil untuk memastikan syarat awal terpenuhi. ".repeat(5)}`).join("\n\n");
    const bytes = await realPdf(compileProductDiktatHtml({ article, diktat }));
    const { PDFParse } = await import("pdf-parse");
    PDFParse.setWorker(pathToFileURL(path.resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")).href);
    const parser = new PDFParse({ data: bytes.slice() });
    try {
      const text = await parser.getText();
      assert.ok(text.pages.length > 1);
      assert.match(text.pages[0].text, /Penanda isi 1\./);
    } finally { await parser.destroy(); }
  });
  const fixtures = [
    [LIMIT_ARTICLE_FIXTURE, "\\delta=\\varepsilon/2"],
    [EIGENVALUES_ARTICLE_FIXTURE, "Av=\\lambda v"],
    [TCP_HANDSHAKE_ARTICLE_FIXTURE, "ACK=ISN+1"],
  ] as const;

  for (const [fixture, formula] of fixtures) {
    test(`renders an authored PDF for ${fixture.id}`, async () => {
      const article = articleProduct(fixture);
      const diktat = diktatProduct(article, formula);
      const html = compileProductDiktatHtml({ article, diktat });
      assert.match(html, /katex/);
      assert.doesNotMatch(html, new RegExp(article.ideaLinks[0].id));
      const bytes = await realPdf(html);
      assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
      const inspected = await inspectProductDiktatPdf(bytes);
      assert.ok(inspected.pageCount >= 1 && inspected.pageCount <= 4, `Expected pageCount between 1 and 4, got ${inspected.pageCount}`);
      assert.match(inspected.text, /Ringkasan mandiri/);
      assert.doesNotMatch(inspected.text, /Pokok gagasan/);
      assert.match(inspected.text, /zyxacademy.com/);
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
    assert.equal(PRODUCT_DIKTAT_PRINT_PROFILE, "a4-self-study-readable-v3");
  });

  test("separates formula rows from symbol bullets and removes the repeated heading", () => {
    const article = articleProduct(LIMIT_ARTICLE_FIXTURE);
    const diktat = {
      ...diktatProduct(article, "x=1"),
      contentMarkdown: "# Diktat ringkas Matematika I Bab 1\n\n### Bilangan real\n\n- $$x=1$$\n- $$y=2$$\n\n- $x$: input.\n- $y$: output.",
    };
    const html = compileProductDiktatHtml({ article, diktat });
    assert.doesNotMatch(html, /<h1 class="section-h1">Diktat ringkas/);
    assert.match(html, /class="formula-list"/);
    assert.match(html, /<ul class="diktat-list">/);
    assert.match(PRODUCT_DIKTAT_FOOTER_TEMPLATE, /href="https:\/\/zyxacademy.com"/);
    const parsed = parseCanonicalDiktatMarkdownToHtml(diktat.contentMarkdown, diktat.title);
    assert.match(parsed, /class="formula-list"/);
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
