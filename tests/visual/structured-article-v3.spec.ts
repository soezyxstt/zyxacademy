import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ROUTE = "/visual-fixtures/structured-article";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

async function stabilize(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}" });
  await page.evaluate(async () => document.fonts.ready);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await stabilize(page);
  const path = testInfo.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
  await testInfo.attach(name, { path, contentType: "image/png" });
  const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(width.scroll, `Horizontal overflow: ${width.scroll}px in ${width.client}px`).toBeLessThanOrEqual(width.client);
}

function observeFailures(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`http: ${response.status()} ${response.url()}`); });
  return errors;
}

const sourceRef = { sourceId: "source-mat-1", version: 1, checksum: HASH_B, excerptIds: ["excerpt-1"] };

const productSections = [
  {
    id: "sec-overview",
    kind: "overview" as const,
    title: "Gambaran bab",
    slug: "gambaran-bab",
    orderIndex: 0,
    learningObjective: "Memahami peta belajar bilangan real, pertaksamaan, dan fungsi.",
    ideaIds: ["idea-real"],
    sourceRefs: [sourceRef],
    blocks: [{ id: "block-overview", blockType: "prior_knowledge_activation", title: "Sebelum mulai", orderIndex: 0, contentMarkdown: "Ingat kembali operasi aljabar dan cara membaca garis bilangan sebelum masuk ke pertaksamaan.", ideaIds: ["idea-real"], sourceRefs: [sourceRef] }],
  },
  {
    id: "sec-real",
    kind: "topic" as const,
    learningSectionId: "learning-real",
    title: "Bilangan real dan representasi desimal",
    slug: "bilangan-real-dan-representasi",
    orderIndex: 1,
    learningObjective: "Menjelaskan representasi bilangan real dan menghubungkannya dengan garis bilangan.",
    ideaIds: ["idea-real"],
    sourceRefs: [sourceRef],
    blocks: [
      { id: "block-real-explanation", blockType: "explanation", title: "Ide inti", orderIndex: 0, contentMarkdown: "Bilangan real mencakup bilangan rasional dan irasional. Setiap bilangan real memiliki tepat satu posisi pada garis bilangan.", ideaIds: ["idea-real"], sourceRefs: [sourceRef] },
      { id: "block-real-formula", blockType: "mathematical_representation", title: "Rumus dan tabel", orderIndex: 1, contentMarkdown: "$$\\mathbb{R}=\\mathbb{Q}\\cup(\\mathbb{R}\\setminus\\mathbb{Q})$$\n\n| Bilangan | Desimal | Jenis |\n|---|---|---|\n| $1/4$ | $0{,}25$ | Rasional |\n| $\\sqrt{2}$ | $1{,}414\\ldots$ | Irasional |", ideaIds: ["idea-real"], sourceRefs: [sourceRef] },
      { id: "block-real-warning", blockType: "misconception", title: "Miskonsepsi", orderIndex: 2, contentMarkdown: "$0{,}999\\ldots$ tidak sedikit lebih kecil dari 1. Keduanya menyatakan nilai yang sama.", ideaIds: ["idea-real"], sourceRefs: [sourceRef] },
      { id: "block-real-check", blockType: "retrieval_prompt", title: "Cek pemahaman", orderIndex: 3, contentMarkdown: "Kelompokkan $-3$, $7/8$, dan $\\sqrt{5}$ sebagai rasional atau irasional.", ideaIds: ["idea-real"], sourceRefs: [sourceRef] },
    ],
  },
  {
    id: "sec-summary",
    kind: "summary" as const,
    title: "Ringkasan dan refleksi",
    slug: "ringkasan-dan-refleksi",
    orderIndex: 2,
    learningObjective: "Menyatukan konsep utama dan memeriksa pemahaman akhir.",
    ideaIds: ["idea-real"],
    sourceRefs: [sourceRef],
    blocks: [
      { id: "block-summary", blockType: "summary", title: "Inti bab", orderIndex: 0, contentMarkdown: "Bilangan real, pertaksamaan, dan fungsi saling terhubung melalui himpunan serta urutan.", ideaIds: ["idea-real"], sourceRefs: [sourceRef] },
      { id: "block-final", blockType: "retrieval_close", title: "Pemeriksaan akhir", orderIndex: 1, contentMarkdown: "Jelaskan hubungan garis bilangan dan himpunan solusi pertaksamaan.", ideaIds: ["idea-real"], sourceRefs: [sourceRef] },
    ],
  },
];

const articleProduct = {
  id: "article-v3-visual",
  productType: "article" as const,
  courseId: "matematika-1",
  chapterId: "bab-1",
  version: 3,
  status: "draft" as const,
  slug: "pertaksamaan-dan-fungsi",
  title: "Pertaksamaan dan Fungsi",
  blocks: [],
  sections: productSections,
  ideaLinks: [{ id: "idea-real", version: 1, semanticHash: HASH_A, weight: 1, role: "primary" as const }],
  sourceRefs: [sourceRef],
  schemaVersion: "1.0",
  sourceHash: HASH_B,
  generationHash: HASH_A,
  creatorId: "author-1",
};

const ideaPayload = {
  structuredReaderEnabled: true,
  bundle: { id: "visual-idea", bundleId: "idea-bundle-visual", courseId: "matematika-1", status: "validated", checksum: HASH_A, createdAt: "2026-08-31T08:00:00.000Z", reviews: [] },
  preview: {
    summary: { ideaCount: 3, sourceCount: 2, excerptCount: 4, relationCount: 2, learningSectionCount: 2, ai: { provider: "Gemini", model: "2.5 Pro", promptVersion: "v3" } },
    learningSections: [
      { id: "learning-real", chapterId: "bab-1", parentSectionId: null, title: "Bilangan real", slug: "bilangan-real", orderIndex: 0, learningObjective: "Menjelaskan bilangan real.", primaryIdeaIds: ["idea-real"], supportingIdeaIds: [], sourceChunkIds: ["chunk-1"] },
      { id: "learning-ineq", chapterId: "bab-1", parentSectionId: null, title: "Pertaksamaan", slug: "pertaksamaan", orderIndex: 1, learningObjective: "Menyelesaikan pertaksamaan.", primaryIdeaIds: ["idea-ineq"], supportingIdeaIds: ["idea-real"], sourceChunkIds: ["chunk-2"] },
    ],
    ideas: [
      { id: "idea-real", code: "MA1-B1-001", chapterId: "bab-1", canonicalStatement: "Bilangan real dapat direpresentasikan pada garis bilangan dan sebagai desimal.", conciseExplanation: "Representasi desimal bilangan real dapat berhenti, berulang, atau tidak berulang tanpa akhir.", latex: "\\mathbb{R}", knowledgeKind: "definition", instructionalRole: "core", learningSection: { id: "learning-real", title: "Bilangan real", slug: "bilangan-real" }, provenance: [{ id: "prov-1", role: "supports", sourceTitle: "Bab 1: Pertaksamaan dan Fungsi", excerpt: "Bilangan real dapat digambarkan sebagai titik pada garis bilangan tanpa celah.", sectionLocator: "1.1 Bilangan real", pageNumber: 2, note: null }] },
      { id: "idea-ineq", code: "MA1-B1-002", chapterId: "bab-1", canonicalStatement: "Perkalian atau pembagian pertaksamaan dengan bilangan negatif membalik arah tanda.", conciseExplanation: "Pembalikan tanda mempertahankan urutan nilai setelah refleksi terhadap nol.", latex: "a<b\\Rightarrow -a>-b", knowledgeKind: "principle", instructionalRole: "core", learningSection: { id: "learning-ineq", title: "Pertaksamaan", slug: "pertaksamaan" }, provenance: [{ id: "prov-2", role: "supports", sourceTitle: "Bab 1: Pertaksamaan dan Fungsi", excerpt: "Jika kedua ruas dikalikan bilangan negatif, tanda pertaksamaan harus dibalik.", sectionLocator: "1.2 Aturan operasi", pageNumber: 4, note: null }] },
      { id: "idea-domain", code: "MA1-B1-003", chapterId: "bab-1", canonicalStatement: "Domain fungsi adalah himpunan input yang membuat aturan fungsi terdefinisi.", conciseExplanation: "Pembatas domain muncul dari operasi seperti pembagian dengan nol dan akar genap bilangan negatif.", latex: null, knowledgeKind: "definition", instructionalRole: "supporting", learningSection: { id: "learning-ineq", title: "Pertaksamaan", slug: "pertaksamaan" }, provenance: [{ id: "prov-3", role: "supports", sourceTitle: "Bab 1: Pertaksamaan dan Fungsi", excerpt: "Domain berisi semua nilai input yang menghasilkan nilai fungsi yang terdefinisi.", sectionLocator: "1.3 Fungsi", pageNumber: 7, note: null }] },
    ],
    relations: [
      { id: "rel-1", sourceIdeaId: "idea-real", targetIdeaId: "idea-ineq", relationType: "prerequisite", explanation: "Urutan bilangan real mendasari pertaksamaan." },
      { id: "rel-2", sourceIdeaId: "idea-ineq", targetIdeaId: "idea-domain", relationType: "related", explanation: "Pertaksamaan menentukan sejumlah batas domain." },
    ],
  },
  draft: { ideas: [], provenance: [], relations: [] },
  itemReviews: [
    { id: "review-idea-1", targetType: "idea", targetId: "idea-real", status: "approved", notes: "Definisi jelas." },
    { id: "review-idea-2", targetType: "idea", targetId: "idea-ineq", status: "changes_requested", notes: "Tambahkan contoh refleksi." },
  ],
};
(ideaPayload.draft as { ideas: unknown[]; provenance: unknown[]; relations: unknown[] }).ideas = JSON.parse(JSON.stringify(ideaPayload.preview.ideas));
(ideaPayload.draft as { ideas: unknown[]; provenance: unknown[]; relations: unknown[] }).relations = JSON.parse(JSON.stringify(ideaPayload.preview.relations));

const productPayload = {
  structuredReaderEnabled: true,
  bundle: { id: "visual-product", bundleId: "product-bundle-visual", courseId: "matematika-1", status: "draft", checksum: HASH_A, createdAt: "2026-08-31T09:00:00.000Z", currentReview: null, reviews: [] },
  previews: [{ id: articleProduct.id, productType: "article", version: 3, status: "draft", title: articleProduct.title, traceability: { ideaIds: ["idea-real"], sourceIds: ["source-mat-1"] }, sections: productSections.map((section) => ({ label: section.title, content: section.blocks.map((block) => block.contentMarkdown).join("\n") })) }],
  draft: { products: [articleProduct] },
  publicationBlocked: false,
  dependencies: [{ id: "dep-1", upstreamEntityType: "idea", upstreamEntityId: "idea-real", upstreamVersion: 1, upstreamHash: HASH_A, downstreamEntityType: "article", downstreamEntityId: articleProduct.id, downstreamVersion: 3, downstreamHash: HASH_A, freshness: "UP_TO_DATE" }],
  blockReviews: [
    { id: "review-sec-overview", productId: articleProduct.id, targetType: "article_section", targetId: "sec-overview", status: "approved", notes: "Pembuka baik." },
    { id: "review-sec-real", productId: articleProduct.id, targetType: "article_section", targetId: "sec-real", status: "changes_requested", notes: "Pastikan tabel tetap terbaca pada layar kecil." },
  ],
  blockReviewSummary: { total: 3, pending: 1, approved: 1, changesRequested: 1 },
};

test.describe("Structured Article V3 visual acceptance", () => {
  test("student reader, TOC, search, callouts, formula, and navigation", async ({ page }, testInfo) => {
    const errors = observeFailures(page);
    await page.route("**/api/student/articles/visual-article/progress", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ maxReadPercent: 100, completed: true, timeSpentSeconds: 180 }) }));
    const response = await page.goto(`${ROUTE}?mode=student&section=bilangan-real-dan-representasi`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: "Bilangan real dan representasi desimal" })).toBeVisible();
    await expect(page.locator(".katex").first()).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await capture(page, testInfo, "student-reader-callouts-formula-table");

    const mobileToc = page.getByRole("button", { name: "Daftar Isi" });
    if (await mobileToc.isVisible()) await mobileToc.click();
    const search = page.getByRole("searchbox", { name: "Cari dalam artikel" });
    await expect(search).toBeVisible();
    await capture(page, testInfo, "student-reader-search-empty");
    await search.fill("pertaksamaan");
    await expect(page.getByText(/Hasil Pencarian/)).toBeVisible();
    await capture(page, testInfo, "student-reader-search-filled");
    expect(errors).toEqual([]);
  });

  test("Idea split pane and mobile evidence", async ({ page }, testInfo) => {
    const errors = observeFailures(page);
    await page.route("**/api/admin/bundles/idea/visual-idea", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ideaPayload) }));
    const response = await page.goto(`${ROUTE}?mode=idea`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: "Review Source Pack + Idea" })).toBeVisible();
    await expect(page.getByText("MA1-B1-001").first()).toBeVisible();
    await capture(page, testInfo, "idea-review-split-pane");
    const evidence = page.getByRole("button", { name: "Bukti" });
    if (await evidence.isVisible()) {
      await evidence.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await capture(page, testInfo, "idea-review-mobile-evidence");
    }
    expect(errors).toEqual([]);
  });

  test("Product section review and semantic reader parity", async ({ page }, testInfo) => {
    const errors = observeFailures(page);
    await page.route("**/api/admin/bundles/product/visual-product", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(productPayload) }));
    const response = await page.goto(`${ROUTE}?mode=product`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: "Review Product" })).toBeVisible();
    const realSection = page.getByRole("button", { name: /Bilangan real dan representasi desimal/ });
    if (await realSection.isVisible()) await realSection.click();
    await expect(page.getByText("Pastikan tabel tetap terbaca pada layar kecil.")).toBeVisible();
    await capture(page, testInfo, "product-section-review-status");
    const queue = page.getByRole("button", { name: "Daftar bagian" });
    if (await queue.isVisible()) {
      await queue.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await capture(page, testInfo, "product-section-review-mobile-queue");
    }
    expect(errors).toEqual([]);
  });
});
