import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { criterionLabels, decideItem, installReviewMock } from "./helpers/solution-review-fixture";
import { solutionCollectionFixture } from "../../app/visual-fixtures/solution-collection/fixture";
import { productEntitySchema, parseProductBundle, computeProductBundleChecksum, deterministicProductSerialization } from "../../lib/bundle/product-validator";
import { previewProducts } from "../../lib/bundle/product-preview";
import { createHash } from "node:crypto";
import { PEDAGOGIC_CRITERION_IDS, QUALITY_POLICY_VERSION } from "../../lib/materials/quality-policy-constants";

const route = "/visual-fixtures/bundle-lifecycle";
const checksum = "a".repeat(64), fingerprint = "b".repeat(64);
const parsedArticle = productEntitySchema.parse({
  id: "article", productType: "article", title: "Jumlah bilangan genap", slug: "bilangan-genap", version: 1, status: "draft", courseId: "course", chapterId: "chapter", schemaVersion: "1.0", sourceHash: "c".repeat(64), generationHash: fingerprint, creatorId: "admin",
  blocks: [{ id: "block", blockType: "explanation", orderIndex: 0, content: "Bilangan genap dapat ditulis sebagai $2k$ dengan $k$ bilangan bulat." }], sections: [], visuals: [],
  ideaLinks: [{ id: "idea", version: 1, semanticHash: fingerprint, role: "primary", weight: 1 }],
  sourceRefs: [{ sourceId: "source", version: 1, checksum: "c".repeat(64), excerptIds: ["excerpt"] }],
});
if (parsedArticle.productType !== "article") throw new Error("ARTICLE_FIXTURE_REQUIRED");
const article = parsedArticle;
const preview = { id: "article", productType: "article", title: article.title, version: 1, status: "draft", traceability: { ideaIds: ["idea"], sourceIds: ["source"] }, sections: [{ label: "explanation", content: article.blocks[0].content }] };
const diktat = productEntitySchema.parse({ ...article, id: "diktat-one", productType: "diktat", title: "Diktat genap", contentMarkdown: "Bilangan genap berbentuk 2k.", sourceArticleId: article.id, sourceArticleVersion: article.version, sourceArticleHash: article.generationHash });
const diktatPreview = { id: "diktat-one", productType: "diktat", title: "Diktat genap", version: 1, status: "draft", traceability: { ideaIds: [], sourceIds: [] }, sections: [] };

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => { await document.fonts.ready; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.screenshot({ path: info.outputPath(`screenshots/${name}.png`), fullPage: true, animations: "disabled" });
}
function track(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  return errors;
}

test("Article review requires every anchored rubric and sends the displayed revision", async ({ page }, info) => {
  const errors = track(page);
  let approved = false, published = false;
  const submissions: Record<string, any>[] = [];
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (request.request().method() === "POST") {
      const body = request.request().postDataJSON(); submissions.push({ path, ...body });
      if (path.endsWith("/review")) approved = true;
      if (path.endsWith("/publish")) published = true;
      await request.fulfill({ json: { result: { ok: true } } }); return;
    }
    if (path.endsWith("/review")) {
      await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return;
    }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", courseId: "course", checksum, status: published ? "published" : "draft", createdAt: "2026-01-01T00:00:00Z", currentReview: approved ? { id: "review", status: "approved", notes: null } : null }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], blockReviewSummary: { total: 0, pending: 0, approved: 0, changesRequested: 0 }, publicationBlocked: false, qualityEvaluation: { valid: true, publicationReady: approved, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, issues: [] }, pdfStatuses: [{ ...{ status: "ready", pageCount: 1 }, productId: diktat.id, revision: checksum }], pdfStatus: { status: "ready", pageCount: 1 }, pedagogicReview: approved ? { id: "ped", status: "approved", policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, criteria: submissions.find(item => item.path.endsWith("/review"))?.criteria ?? [], createdAt: "2026-01-01T00:00:00Z" } : null, revisionFreshness: { currentFingerprint: fingerprint, reviewFingerprint: approved ? fingerprint : null, isFresh: approved, isFingerprintMatch: approved, isPolicyMatch: approved, policyVersion: QUALITY_POLICY_VERSION, completenessState: approved ? "complete" : "incomplete" } } });
  });
  await page.goto(route);
  await expect(page.getByRole("heading", { name: "Review pedagogi", exact: true })).toBeVisible();
  const approve = page.getByRole("button", { name: "Setujui bundle", exact: true });
  await expect(approve).toBeDisabled();
  await capture(page, info, "article-rubric-incomplete");
  const fields = page.getByRole("region", { name: "Review pedagogi", exact: true }).locator("fieldset");
  await expect(fields).toHaveCount(8);
  for (let index = 0; index < 8; index++) {
    await fields.nth(index).getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Terpenuhi", exact: true }).click();
    await fields.nth(index).getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: article.title, exact: true }).click();
    await fields.nth(index).getByRole("textbox").fill("Definisi dan syarat sudah sesuai isi artikel.");
  }
  await expect(approve).toBeEnabled();
  await capture(page, info, "article-rubric-complete");
  await approve.click();
  expect(submissions[0]).toMatchObject({ expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sectionDecisions: [] });
  expect(submissions[0].criteria.map((item: any) => item.criterionId)).toEqual([...PEDAGOGIC_CRITERION_IDS]);
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeEnabled();
  await capture(page, info, "article-approved");
  await fields.nth(0).getByRole("textbox").fill("Perlu pemeriksaan lagi.");
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Simpan keputusan" })).toBeVisible();
  await capture(page, info, "article-unsaved-blocks-publish");
  page.once("dialog", dialog => void dialog.accept());
  await page.reload();
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Publikasikan", exact: true }).click();
  expect(submissions[1]).toMatchObject({ expectedRevision: checksum });
  await expect(page.getByText("Telah dipublikasikan", { exact: true })).toBeVisible();
  await capture(page, info, "article-published");
  expect(new URL(page.url()).pathname).toBe(route);
  expect(errors).toEqual([]);
});

test("Idea decisions and publication remain bound to the displayed checksum", async ({ page }, info) => {
  const errors = track(page);
  let itemApproved = false, approved = false, published = false;
  const sent: Record<string, any>[] = [];
  const idea = { id: "idea", code: "I1", chapterId: "chapter", canonicalStatement: "Jumlah dua bilangan genap selalu genap.", conciseExplanation: "Jika a dan b bulat, maka 2a + 2b = 2(a+b).", latex: null, knowledgeKind: "principle", instructionalRole: "core", learningSection: null, provenance: [] };
  await page.route("**/api/admin/bundles/**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (request.request().method() !== "GET") {
      const body = request.request().postDataJSON(); sent.push({ path, ...body });
      if (path.endsWith("item-reviews")) { itemApproved = true; await request.fulfill({ json: { result: { id: "item-review", targetType: "idea", targetId: "idea", status: "approved", notes: null } } }); return; }
      if (path.endsWith("/review")) approved = true;
      if (path.endsWith("/publish")) published = true;
      await request.fulfill({ json: { result: { ok: true } } }); return;
    }
    await request.fulfill({ json: { bundle: { id: "visual-idea", bundleId: "idea-bundle", courseId: "course", checksum, status: published ? "published" : approved ? "approved" : "validated", createdAt: "2026-01-01T00:00:00Z", reviews: approved ? [{ status: "approved", notes: null }] : [], currentReview: approved ? { status: "approved", notes: null, revisionBound: true } : null }, preview: { summary: { ideaCount: 1, sourceCount: 0, excerptCount: 0, relationCount: 0, learningSectionCount: 0, ai: null }, learningSections: [], ideas: [idea], relations: [] }, draft: { ideas: [idea], provenance: [], relations: [] }, itemReviews: itemApproved ? [{ id: "item-review", targetType: "idea", targetId: "idea", status: "approved", notes: null }] : [] } });
  });
  await page.goto(`${route}?mode=idea`);
  await expect(page.getByText(idea.canonicalStatement, { exact: true }).first()).toBeVisible();
  await capture(page, info, "idea-unreviewed");
  await page.getByRole("button", { name: "Setujui dan lanjut", exact: true }).click();
  expect(sent[0]).toMatchObject({ expectedRevision: checksum, targetType: "idea", targetId: "idea", status: "approved" });
  await capture(page, info, "idea-item-approved");
  await page.locator("#idea-review-note").fill("Draft catatan review sebelum edit.");
  await expect(page.getByRole("button", { name: "Edit isi", exact: true })).toBeDisabled();
  await capture(page, info, "idea-unsaved-bundle-note-protected");
  await page.getByRole("button", { name: "Buang perubahan catatan review", exact: true }).click();
  await expect(page.locator("#idea-review-note")).toHaveValue("");
  await page.getByRole("button", { name: "Setujui", exact: true }).click();
  expect(sent[1]).toMatchObject({ expectedRevision: checksum, decision: "approved" });
  await capture(page, info, "idea-approved");
  await page.getByRole("button", { name: "Publikasikan", exact: true }).click();
  expect(sent[2]).toMatchObject({ expectedRevision: checksum });
  await capture(page, info, "idea-published");
  expect(new URL(page.url()).pathname).toBe(route);
  expect(errors).toEqual([]);
});


test("English rubric labels and legacy Idea review handoff use the existing surfaces", async ({ page }, info) => {
  const errors = track(page);
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    if (new URL(request.request().url()).pathname.endsWith("/review")) {
      await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return;
    }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z", currentReview: null }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], blockReviewSummary: { total: 0, pending: 0, approved: 0, changesRequested: 0 }, qualityEvaluation: { valid: true, publicationReady: false, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, issues: [] }, pdfStatuses: [{ ...{ status: "none" }, productId: diktat.id, revision: checksum }], pdfStatus: { status: "none" } } });
  });
  await page.goto(`${route}?language=en`);
  await expect(page.getByRole("region", { name: "Pedagogic review", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Decision for Concept accuracy", exact: true })).toBeVisible();
  await capture(page, info, "article-rubric-english");
  await page.route("**/api/admin/bundles/idea/visual-idea", request => request.fulfill({ json: { bundle: { id: "visual-idea", status: "validated" }, preview: { summary: { ideaCount: 0, sourceCount: 0, excerptCount: 0, relationCount: 0, ai: null }, ideas: [], relations: [] } } }));
  await page.goto(`${route}?mode=panel`);
  await page.getByRole("button", { name: "Buka review", exact: true }).click();
  await expect(page.getByRole("link", { name: "Buka review Idea", exact: true })).toHaveAttribute("href", "/admin/materials/review/idea/visual-idea");
  await capture(page, info, "idea-legacy-panel-handoff");
  expect(errors).toEqual([]);
});

test("real Product parent preserves review drafts through refresh and a replaced bundle", async ({ page }, info) => {
  const errors = track(page);
  await installReviewMock(page);
  await page.addInitScript(() => { (window as any).__solutionReviewMock.revision = "a".repeat(64); });
  let detailReads = 0;
  await page.route("**/api/admin/bundles/product/fixture-import", async request => {
    detailReads++;
    const current = await page.evaluate(() => ({ revision: (window as any).__solutionReviewMock.revision }));
    const collection = structuredClone(solutionCollectionFixture);
    if (current.revision === "b".repeat(64)) collection.items[0].prompt = [{ id: "triangle-revised-prompt", kind: "markdown", markdown: "Segitiga memiliki alas 6 cm dan tinggi 4 cm. Tentukan luasnya beserta satuannya." }];
    await request.fulfill({ json: { bundle: { id: "fixture-import", bundleId: "solution-bundle", courseId: "course", checksum: current.revision, status: "draft", createdAt: "2026-01-01T00:00:00Z", currentReview: null }, previews: [{ id: collection.id, productType: "solution_collection", title: collection.title, version: 1, status: "draft", traceability: { ideaIds: [], sourceIds: [] }, sections: [] }], draft: { products: [{ id: collection.id, productType: "solution_collection", title: collection.title, version: 1, collection }] }, dependencies: [], blockReviews: [], blockReviewSummary: { total: 0, pending: 0, approved: 0, changesRequested: 0 }, publicationBlocked: false, qualityEvaluation: { publicationReady: false, issues: [{ code: "PRODUCT_V5_REVIEW_REQUIRED", severity: "blocking" }] } } });
  });
  await page.goto(`${route}?mode=solution`);
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeEnabled();
  await page.evaluate(() => Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("Unavailable", "SecurityError"); } }));
  await decideItem(page, "Disetujui");
  await page.getByLabel("Catatan", { exact: true }).fill("Draft sebelum refresh induk.");
  await page.getByLabel("Catatan", { exact: true }).evaluate(element => { element.setAttribute("data-review-instance", "kept"); });
  await page.evaluate(() => { (window as any).__solutionReviewMock.delayContext = true; });
  await page.getByRole("button", { name: "Muat ulang status", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__solutionReviewMock.releaseContext))).toBe(true);
  const loadingStatus = page.getByRole("status").filter({ hasText: "Memuat status review" });
  await expect(loadingStatus).toBeVisible();
  expect(await loadingStatus.evaluate(element => element.closest('[aria-busy="true"]') !== null)).toBe(false);
  expect(await page.getByLabel(criterionLabels[0], { exact: true }).evaluate(element => element.closest('[aria-busy="true"]') !== null)).toBe(true);
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("Draft sebelum refresh induk.");
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toContainText("Disetujui");
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeDisabled();
  await capture(page, info, "solution-parent-slow-refresh-keeps-decisions");
  await page.evaluate(() => (window as any).__solutionReviewMock.releaseContext());
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveAttribute("data-review-instance", "kept");
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("Draft sebelum refresh induk.");
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toContainText("Disetujui");
  await expect(page.getByText("Penyimpanan tab tidak tersedia.", { exact: false })).toBeVisible();
  await expect(page.getByText("Draft review dipulihkan di tab ini setelah dimuat ulang.", { exact: true })).toBeVisible();
  expect(detailReads).toBe(2);
  await capture(page, info, "solution-parent-refresh-keeps-memory");
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await decideItem(page, "Disetujui");
  await page.getByLabel("Catatan", { exact: true }).fill("Item yang tidak berubah tetap tersimpan.");
  await page.evaluate(() => { const state = (window as any).__solutionReviewMock; state.revision = "b".repeat(64); state.hashes[0] = "changed-triangle-hash"; });
  await page.getByRole("button", { name: "Setujui bundle", exact: true }).click();
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("Item yang tidak berubah tetap tersimpan.");
  await expect(page.getByRole("status").filter({ hasText: "1 dari 2 soal selesai direview" })).toBeVisible();
  expect(detailReads).toBe(3);
  await capture(page, info, "solution-parent-new-revision-keeps-unchanged-item");
  await page.getByRole("button", { name: "Sebelumnya", exact: true }).click();
  await expect(page.getByText("Tentukan luasnya beserta satuannya.", { exact: false })).toBeVisible();
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toContainText("Pilih keputusan");
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Draft revisi sebelumnya", { exact: true })).toHaveValue(/Draft sebelum refresh induk\./);
  await expect(page.getByLabel("Draft revisi sebelumnya", { exact: true })).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "Setujui bundle", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeDisabled();
  await capture(page, info, "solution-parent-changed-item-needs-review");
  await page.getByRole("button", { name: "Buang draft lama", exact: true }).click();
  await capture(page, info, "solution-parent-previous-draft-discard-confirmation");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(page.getByLabel("Draft revisi sebelumnya", { exact: true })).toHaveValue(/Draft sebelum refresh induk\./);
  await page.getByRole("button", { name: "Buang draft lama", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Buang draft lama", exact: true }).click();
  await expect(page.getByLabel("Draft revisi sebelumnya", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Catatan", { exact: true })).toBeEnabled();
  await decideItem(page, "Disetujui");
  await page.getByRole("button", { name: "Setujui bundle", exact: true }).click();
  await expect(page.getByText("Persetujuan tersimpan untuk revisi ini.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__solutionReviewMock.submitted.expectedRevision)).toBe("b".repeat(64));
  await capture(page, info, "solution-parent-review-saved-on-current-revision");
  expect(errors).toEqual([]);
});

test("flashcard-only readiness publishes without a PDF requirement", async ({ page }, info) => {
  const errors = track(page);
  let published = false;
  const sent: unknown[] = [];
  const common = { courseId: "course", chapterId: "chapter", version: 1, status: "draft", schemaVersion: "1.0", sourceHash: fingerprint, generationHash: fingerprint, creatorId: "creator", ideaLinks: [{ id: "idea", version: 1, semanticHash: fingerprint, weight: 1, role: "primary" }], sourceRefs: [{ sourceId: "source", version: 1, checksum: fingerprint, excerptIds: ["chunk"] }] };
  const flashcards = productEntitySchema.parse({ ...common, id: "cards", productType: "flashcard_set", title: "Latihan istilah", cards: ["card-even"] });
  const card = productEntitySchema.parse({ ...common, id: "card-even", productType: "flashcard", setId: "cards", front: "Apa bentuk umum bilangan genap?", back: "$2k$ untuk suatu bilangan bulat $k$.", atomic: true });
  const products = [flashcards, card];
  const bytes = (value: unknown) => new TextEncoder().encode(deterministicProductSerialization(value));
  const files = new Map([["products.json", bytes(products)], ["dependencies.json", bytes([])]]);
  const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
  const manifest = { bundleId: "cards-bundle", bundleType: "product" as const, schemaVersion: "product-bundle.v3" as const, courseId: "course", creatorId: "creator", createdAt: "2026-01-01T00:00:00Z", conflicts: [], entityFiles: [{ path: "products.json", entityType: "products" as const, checksum: digest(files.get("products.json")!), stableIds: products.map(product => product.id) }, { path: "dependencies.json", entityType: "dependencies" as const, checksum: digest(files.get("dependencies.json")!), stableIds: [] }] };
  const revision = computeProductBundleChecksum(manifest, files);
  files.set("manifest.json", bytes({ ...manifest, bundleChecksum: revision }));
  const validated = parseProductBundle(files);
  expect(validated.success).toBe(true);
  if (!validated.success) throw new Error(JSON.stringify(validated.issues));
  const previews = previewProducts(validated.data.products);
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (request.request().method() === "POST") { const input = request.request().postDataJSON(); expect(input.expectedRevision).toBe(revision); sent.push(input); published = true; await request.fulfill({ json: { result: { ok: true } } }); return; }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, contentFingerprint: "", sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "cards-bundle", courseId: "course", checksum: revision, status: published ? "published" : "draft", createdAt: "2026-01-01T00:00:00Z", currentReview: { id: "review", status: "approved", notes: null } }, previews, draft: { products }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: true, issues: [] }, pdfStatus: { status: "not_required" } } });
  });
  await page.goto(route);
  await expect(page.getByText("PDF tidak diperlukan", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Render PDF", exact: true })).toHaveCount(0);
  await expect(page.locator("article").getByText("Apa bentuk umum bilangan genap?", { exact: true })).toHaveCount(1);
  await capture(page, info, "flashcard-linked-card");
  await page.getByRole("tab", { name: "Set flashcard", exact: true }).click();
  await expect(page.getByText("Apa bentuk umum bilangan genap?", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeEnabled();
  if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Catatan revisi", exact: true }).click();
  await page.locator("#product-review-note").fill("Alasan untuk keputusan kartu.");
  await expect(page.getByRole("button", { name: "Perlu perbaikan", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tolak", exact: true })).toBeEnabled();
  await page.locator("#product-review-note").fill("");
  await capture(page, info, "flashcard-no-pdf-ready");
  await page.getByRole("button", { name: "Publikasikan", exact: true }).click();
  expect(sent).toEqual([{ expectedRevision: revision }]);
  await expect(page.getByText("Telah dipublikasikan", { exact: true })).toBeVisible();
  await capture(page, info, "flashcard-no-pdf-published");
  expect(errors).toEqual([]);
});

test("saved rubric retains section and block evidence through a new decision", async ({ page }, info) => {
  const errors = track(page);
  const section = { id: "section", kind: "topic", title: "Sifat genap", slug: "sifat-genap", orderIndex: 0, learningObjective: "Menjelaskan bentuk genap", ideaIds: ["idea"], sourceRefs: article.sourceRefs, blocks: article.blocks.map(block => ({ id: block.id, blockType: block.blockType, orderIndex: block.orderIndex, ideaIds: ["idea"], sourceRefs: article.sourceRefs, contentMarkdown: block.content })) };
  const structured = productEntitySchema.parse({ ...article, blocks: [], sections: [section] });
  const anchors = [{ targetType: "section", targetId: "section" }, { targetType: "block", targetId: "block" }];
  const savedCriteria = PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met", reason: "Bukti cocok dengan bagian dan blok yang diperiksa.", contentAnchors: anchors }));
  let submitted: any = null;
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (request.request().method() === "POST") { submitted = request.request().postDataJSON(); await request.fulfill({ json: { result: { ok: true } } }); return; }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, contentFingerprint: fingerprint, policyVersion: QUALITY_POLICY_VERSION, sections: [{ articleId: "article", sectionId: "section", title: section.title, semanticHash: "c".repeat(64) }] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z", currentReview: null }, previews: [preview, diktatPreview], draft: { products: [structured, diktat] }, dependencies: [], blockReviews: [{ productId: "article", targetType: "article_section", targetId: "section", status: "approved" }], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ ...{ status: "ready" }, productId: diktat.id, revision: checksum }], pdfStatus: { status: "ready" }, pedagogicReview: { id: "ped", status: "changes_requested", policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, criteria: savedCriteria } } });
  });
  await page.goto(route);
  const fields = page.getByRole("region", { name: "Review pedagogi", exact: true }).locator("fieldset");
  await expect(fields).toHaveCount(8);
  await expect(fields.first().getByRole("combobox").nth(1)).toContainText("Sifat genap");
  await expect(fields.first().getByText("Blok: Jumlah bilangan genap: Blok block", { exact: true })).toBeVisible();
  await fields.first().getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: article.title, exact: true }).click();
  await expect(fields.first().getByText("Blok: Jumlah bilangan genap: Blok block", { exact: true })).toBeVisible();
  await fields.first().getByRole("textbox").fill("Penalaran pada bagian dan blok sudah diperiksa kembali.");
  await capture(page, info, "rubric-section-and-block-restored");
  await page.getByRole("button", { name: "Setujui bundle", exact: true }).click();
  await expect.poll(() => submitted?.criteria?.length).toBe(8);
  expect(submitted.criteria[0].contentAnchors).toEqual([{ targetType: "document", targetId: "article" }, anchors[1]]);
  expect(submitted.criteria.slice(1).every((item: any) => JSON.stringify(item.contentAnchors) === JSON.stringify(anchors))).toBe(true);
  expect(errors).toEqual([]);
});

test("a second Idea reviewer can approve a revision rejected by another admin", async ({ page }, info) => {
  const errors = track(page);
  let decision: string | null = null;
  const idea = { id: "idea", code: "I1", chapterId: "chapter", canonicalStatement: "Jumlah dua bilangan genap selalu genap.", conciseExplanation: "2a + 2b = 2(a+b).", latex: null, knowledgeKind: "principle", instructionalRole: "core", learningSection: null, provenance: [] };
  await page.route("**/api/admin/bundles/idea/visual-idea**", async request => {
    if (request.request().method() === "POST") { decision = request.request().postDataJSON().decision; await request.fulfill({ json: { result: { ok: true } } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-idea", bundleId: "idea-bundle", courseId: "course", checksum, status: decision ?? "rejected", createdAt: "2026-01-01T00:00:00Z", reviews: [{ status: "rejected", notes: "Keputusan reviewer lain." }], currentReview: decision ? { status: decision, notes: null, revisionBound: true } : null }, preview: { summary: { ideaCount: 1, sourceCount: 0, excerptCount: 0, relationCount: 0, learningSectionCount: 0, ai: null }, learningSections: [], ideas: [idea], relations: [] }, draft: { ideas: [idea], provenance: [], relations: [] }, itemReviews: [{ id: "item-review", targetType: "idea", targetId: "idea", status: "approved", notes: null }] } });
  });
  await page.goto(`${route}?mode=idea`);
  await expect(page.getByRole("button", { name: "Setujui", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Tolak", exact: true })).toBeEnabled();
  await capture(page, info, "idea-other-reviewer-can-decide");
  await page.getByRole("button", { name: "Setujui", exact: true }).click();
  await expect(page.getByText("Review Anda disetujui", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setujui dan lanjut", exact: true })).toBeDisabled();
  await expect(page.getByPlaceholder("Catatan review Idea")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Tolak", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeEnabled();
  expect(decision).toBe("approved");
  await capture(page, info, "idea-own-final-decision-immutable");
  expect(errors).toEqual([]);
});


test("an Idea publisher keeps their approved decision after another reviewer rejects", async ({ page }, info) => {
  const errors = track(page);
  let published = false;
  const sent: Record<string, any>[] = [];
  const idea = { id: "idea", code: "I1", chapterId: "chapter", canonicalStatement: "Jumlah dua bilangan genap selalu genap.", conciseExplanation: "2a + 2b = 2(a+b).", latex: null, knowledgeKind: "principle", instructionalRole: "core", learningSection: null, provenance: [] };
  await page.route("**/api/admin/bundles/idea/visual-idea**", async request => {
    if (request.request().method() === "POST") {
      const body = request.request().postDataJSON(); sent.push(body);
      expect(new URL(request.request().url()).pathname.endsWith("/publish")).toBe(true);
      expect(body).toMatchObject({ expectedRevision: checksum });
      published = true;
      await request.fulfill({ json: { result: { published: true } } }); return;
    }
    await request.fulfill({ json: { bundle: { id: "visual-idea", bundleId: "idea-bundle", courseId: "course", checksum, status: published ? "published" : "rejected", createdAt: "2026-01-01T00:00:00Z", reviews: [{ status: "approved", notes: null }, { status: "rejected", notes: "Keputusan reviewer lain." }], currentReview: { status: "approved", notes: null, revisionBound: true } }, preview: { summary: { ideaCount: 1, sourceCount: 0, excerptCount: 0, relationCount: 0, learningSectionCount: 0, ai: null }, learningSections: [], ideas: [idea], relations: [] }, draft: { ideas: [idea], provenance: [], relations: [] }, itemReviews: [{ id: "item-review", targetType: "idea", targetId: "idea", status: "approved", notes: null }] } });
  });
  await page.goto(`${route}?mode=idea`);
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Tolak", exact: true })).toHaveCount(0);
  await capture(page, info, "idea-own-approval-despite-other-rejection");
  await page.getByRole("button", { name: "Publikasikan", exact: true }).click();
  await expect(page.getByText("Telah dipublikasikan", { exact: true })).toBeVisible();
  expect(sent).toHaveLength(1);
  await capture(page, info, "idea-own-approval-published");
  expect(errors).toEqual([]);
});

test("PDF readiness refresh preserves an Article review draft and confirms revision changes", async ({ page }, info) => {
  const errors = track(page);
  let revision = checksum, currentFingerprint = fingerprint, replaceOnRender = false, posts = 0;
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (request.request().method() === "POST" && path.endsWith("/pdf")) {
      posts++;
      if (replaceOnRender) { revision = "c".repeat(64); currentFingerprint = "d".repeat(64); }
      await request.fulfill({ status: 202, json: { outcome: "accepted", requestId: request.request().postDataJSON().requestId, attemptId: `attempt-${posts}`, duplicate: false } }); return;
    }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: revision, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: currentFingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", courseId: "course", checksum: revision, status: "draft", createdAt: "2026-01-01T00:00:00Z", currentReview: null }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { valid: true, publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision, status: posts ? "failed" : "missing", ...(posts ? { id: `attempt-${posts}` } : {}) }], pedagogicReview: null } });
  });
  await page.goto(route);
  const fields = page.getByRole("region", { name: "Review pedagogi", exact: true }).locator("fieldset");
  await fields.first().getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Terpenuhi", exact: true }).click();
  await fields.first().getByRole("textbox").fill("Draft ketepatan yang belum selesai.");
  if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Catatan revisi", exact: true }).click();
  await page.locator("#product-review-note").fill("Alasan keputusan yang belum disimpan.");
  await page.getByRole("button", { name: "Render PDF", exact: true }).click();
  await expect(fields.first().getByRole("textbox")).toHaveValue("Draft ketepatan yang belum selesai.");
  await expect(fields.first().getByRole("combobox").first()).toHaveText("Terpenuhi");
  await expect(page.locator("#product-review-note")).toHaveValue("Alasan keputusan yang belum disimpan.");
  await capture(page, info, "article-pdf-refresh-keeps-draft");
  replaceOnRender = true;
  await page.getByRole("button", { name: "Render ulang PDF", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Buka revisi baru?" })).toBeVisible();
  await capture(page, info, "article-pdf-revision-change-confirmation");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(fields.first().getByRole("textbox")).toHaveValue("Draft ketepatan yang belum selesai.");
  await expect(page.locator("#product-review-note")).toHaveValue("Alasan keputusan yang belum disimpan.");
  await expect(page.getByRole("button", { name: "Setujui bundle", exact: true })).toBeDisabled();
  await capture(page, info, "article-pdf-revision-cancel-keeps-draft");
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Buka revisi baru", exact: true }).click();
  await expect(fields.first().getByRole("textbox")).toHaveValue("");
  await expect(page.locator("#product-review-note")).toHaveValue("");
  await capture(page, info, "article-pdf-new-revision-starts-fresh");
  expect(errors).toEqual([]);
});


test("legacy Idea reaffirmation stays editable until revision evidence locks the item", async ({ page }, info) => {
  const errors = track(page);
  let revisionBound = false;
  const idea = { id: "idea", code: "I1", chapterId: "chapter", canonicalStatement: "Jumlah dua bilangan genap selalu genap.", conciseExplanation: "2a + 2b = 2(a+b).", latex: null, knowledgeKind: "principle", instructionalRole: "core", learningSection: null, provenance: [] };
  await page.route("**/api/admin/bundles/idea/visual-idea**", async request => {
    if (request.request().method() === "POST") {
      expect(new URL(request.request().url()).pathname.endsWith("/review")).toBe(true);
      expect(request.request().postDataJSON()).toMatchObject({ expectedRevision: checksum, decision: "approved", notes: "Original review note" });
      revisionBound = true;
      await request.fulfill({ json: { result: { status: "approved" } } }); return;
    }
    await request.fulfill({ json: { bundle: { id: "visual-idea", bundleId: "idea-bundle", courseId: "course", checksum, status: revisionBound ? "approved" : "rejected", createdAt: "2026-01-01T00:00:00Z", reviews: [{ status: "approved", notes: "Original review note" }, { status: "rejected", notes: "Other reviewer" }], currentReview: { status: "approved", notes: "Original review note", revisionBound } }, preview: { summary: { ideaCount: 1, sourceCount: 0, excerptCount: 0, relationCount: 0, learningSectionCount: 0, ai: null }, learningSections: [], ideas: [idea], relations: [] }, draft: { ideas: [idea], provenance: [], relations: [] }, itemReviews: [{ id: "item-review", targetType: "idea", targetId: "idea", status: "approved", notes: "Source reviewed" }] } });
  });
  await page.goto(`${route}?mode=idea`);
  await expect(page.getByRole("button", { name: "Setujui dan lanjut", exact: true })).toBeEnabled();
  await expect(page.getByPlaceholder("Catatan review Idea")).toBeEnabled();
  await expect(page.locator("#idea-review-note")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeDisabled();
  await expect(page.getByText("Review Anda disetujui", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Catatan review Idea").fill("Unsaved note B");
  await expect(page.getByRole("button", { name: "Tegaskan persetujuan", exact: true })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Ada catatan item" })).toBeVisible();
  await capture(page, info, "idea-unsaved-note-blocks-reaffirmation");
  await page.getByRole("button", { name: "Buang perubahan catatan", exact: true }).click();
  await expect(page.getByPlaceholder("Catatan review Idea")).toHaveValue("Source reviewed");
  await capture(page, info, "idea-legacy-reaffirmation-editable");
  await page.getByRole("button", { name: "Tegaskan persetujuan", exact: true }).click();
  await expect(page.getByText("Review Anda disetujui", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setujui dan lanjut", exact: true })).toBeDisabled();
  await expect(page.getByPlaceholder("Catatan review Idea")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Tegaskan persetujuan", exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder("Catatan review Idea")).toHaveValue("Source reviewed");
  await capture(page, info, "idea-revision-evidence-locks-items");
  expect(errors).toEqual([]);
});

test("content editing and PDF refresh keep review drafts, and mobile notes close without erasing text", async ({ page }, info) => {
  const errors = track(page);
  let currentArticle = structuredClone(article), revision = checksum, currentFingerprint = fingerprint, pdfRequests = 0, detailReads = 0;
  let releasePdf: () => void = () => {};
  const pdfGate = new Promise<void>(resolve => { releasePdf = resolve; });
  let holdPdfRead = false;
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (request.request().method() === "PUT") {
      currentArticle = request.request().postDataJSON().draft.products[0];
      revision = "c".repeat(64); currentFingerprint = "d".repeat(64);
      await request.fulfill({ json: { result: { ok: true } } }); return;
    }
    if (request.request().method() === "POST" && path.endsWith("/pdf")) {
      pdfRequests++; holdPdfRead = true;
      await request.fulfill({ status: 202, json: { outcome: "accepted", requestId: request.request().postDataJSON().requestId, attemptId: "attempt-one", duplicate: false } }); return;
    }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: revision, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: currentFingerprint, sections: [] } }); return; }
    detailReads++;
    if (holdPdfRead) await pdfGate;
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", courseId: "course", checksum: revision, status: "draft", createdAt: "2026-01-01T00:00:00Z", currentReview: null }, previews: [{ ...preview, title: currentArticle.title }, diktatPreview], draft: { products: [currentArticle, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision, status: pdfRequests ? "failed" : "missing", ...(pdfRequests ? { id: "attempt-one" } : {}) }], pedagogicReview: null } });
  });
  await page.goto(route);
  const fields = page.getByRole("region", { name: "Review pedagogi", exact: true }).locator("fieldset");
  await fields.first().getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Terpenuhi", exact: true }).click();
  await fields.first().getByRole("textbox").fill("Catatan rubrik yang harus bertahan.");
  if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Catatan revisi", exact: true }).click();
  await page.locator("#product-review-note").fill("Alasan keputusan yang harus bertahan.");
  await page.getByRole("button", { name: "Render PDF", exact: true }).click();
  try {
    await expect(fields.first().getByRole("textbox")).toBeDisabled();
    await expect(page.locator("#product-review-note")).toBeDisabled();
    await capture(page, info, "article-pdf-pending-freezes-review");
  } finally { releasePdf(); }
  await expect(fields.first().getByRole("textbox")).toBeEnabled();
  if (info.project.name === "mobile-380") {
    const close = page.getByRole("button", { name: "Tutup catatan", exact: true });
    expect(await close.evaluate(element => getComputedStyle(element).fontSize)).toBe("14px");
    await close.click();
    await expect(page.locator("#product-review-note")).toBeHidden();
    await capture(page, info, "article-mobile-notes-closed");
    await page.getByRole("button", { name: "Catatan revisi", exact: true }).click();
  }
  await expect(page.locator("#product-review-note")).toHaveValue("Alasan keputusan yang harus bertahan.");
  await capture(page, info, "article-notes-retained");
  await page.getByRole("button", { name: /Mode blok/i }).click();
  await page.getByRole("button", { name: "Edit isi", exact: true }).click();
  await page.getByRole("textbox", { name: "Judul artikel", exact: true }).fill("Judul yang belum disimpan");
  await expect(page.getByRole("button", { name: "Render ulang PDF", exact: true })).toBeDisabled();
  await expect(fields.first().getByRole("textbox")).toBeDisabled();
  await capture(page, info, "article-editor-blocks-pdf");
  const readsBeforeCancel = detailReads;
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  expect(detailReads).toBe(readsBeforeCancel);
  expect(pdfRequests).toBe(1);
  await expect(fields.first().getByRole("textbox")).toHaveValue("Catatan rubrik yang harus bertahan.");
  await expect(page.locator("#product-review-note")).toHaveValue("Alasan keputusan yang harus bertahan.");
  await capture(page, info, "article-editor-cancel-keeps-review");
  await page.getByRole("button", { name: "Edit isi", exact: true }).click();
  await page.getByRole("textbox", { name: "Judul artikel", exact: true }).fill("Judul revisi tersimpan");
  await page.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Buka revisi baru?" })).toBeVisible();
  await capture(page, info, "article-content-save-protects-review");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(fields.first().getByRole("textbox")).toHaveValue("Catatan rubrik yang harus bertahan.");
  await expect(page.locator("#product-review-note")).toHaveValue("Alasan keputusan yang harus bertahan.");
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Buka revisi baru", exact: true }).click();
  await expect(fields.first().getByRole("textbox")).toHaveValue("");
  expect(currentArticle.title).toBe("Judul revisi tersimpan");
  expect(errors).toEqual([]);
});

test("rubric and decision notes cannot change while a review submission is pending", async ({ page }, info) => {
  const errors = track(page);
  let submitted: any = null, saved = false;
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const savedCriteria = PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met", reason: "Isi telah diperiksa.", contentAnchors: [{ targetType: "document", targetId: "article" }] }));
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (request.request().method() === "POST") { submitted = request.request().postDataJSON(); await gate; saved = true; await request.fulfill({ json: { result: { ok: true } } }); return; }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", courseId: "course", checksum, status: "draft", createdAt: "2026-01-01T00:00:00Z", currentReview: saved ? { status: "approved", notes: submitted.reason } : null }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: saved, issues: [] }, pdfStatuses: [{ ...{ status: "ready" }, productId: diktat.id, revision: checksum }], pdfStatus: { status: "ready" }, pedagogicReview: { status: "approved", policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, id: "ped", createdAt: "2026-01-01T00:00:00Z", criteria: saved ? submitted.criteria : savedCriteria, notes: saved ? submitted.reason : "" } } });
  });
  await page.goto(route);
  await page.getByRole("button", { name: /Mode blok/i }).click();
  const fields = page.getByRole("region", { name: "Review pedagogi", exact: true }).locator("fieldset");
  await fields.first().getByRole("textbox").fill("Snapshot yang dikirim ke server.");
  if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Catatan revisi", exact: true }).click();
  await page.locator("#product-review-note").fill("Catatan keputusan yang dikirim.");
  await page.getByRole("button", { name: "Setujui bundle", exact: true }).click();
  try {
    await expect(fields.first().getByRole("textbox")).toBeDisabled();
    await expect(fields.first().getByRole("combobox").first()).toBeDisabled();
    await expect(fields.first().getByRole("combobox").nth(1)).toBeDisabled();
    await expect(page.locator("#product-review-note")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Edit isi", exact: true })).toBeDisabled();
    await capture(page, info, "article-review-submit-locks-inputs");
  } finally { release(); }
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeEnabled();
  await expect(fields.first().getByRole("textbox")).toHaveValue("Snapshot yang dikirim ke server.");
  await expect(page.locator("#product-review-note")).toHaveValue("Catatan keputusan yang dikirim.");
  expect(submitted.criteria[0].reason).toBe("Snapshot yang dikirim ke server.");
  await capture(page, info, "article-review-submit-retains-saved-snapshot");
  expect(errors).toEqual([]);
});


test("legacy rejection is shown explicitly before reaffirming a different global status", async ({ page }, info) => {
  const errors = track(page);
  let revisionBound = false;
  const idea = { id: "idea", code: "I1", chapterId: "chapter", canonicalStatement: "Jumlah dua bilangan genap selalu genap.", conciseExplanation: "2a + 2b = 2(a+b).", latex: null, knowledgeKind: "principle", instructionalRole: "core", learningSection: null, provenance: [] };
  await page.route("**/api/admin/bundles/idea/visual-idea**", async request => {
    if (request.request().method() === "POST") {
      expect(request.request().postDataJSON()).toMatchObject({ expectedRevision: checksum, decision: "rejected", notes: "Original rejection note" });
      revisionBound = true; await request.fulfill({ json: { result: { status: "rejected" } } }); return;
    }
    await request.fulfill({ json: { bundle: { id: "visual-idea", bundleId: "idea-bundle", courseId: "course", checksum, status: revisionBound ? "rejected" : "approved", createdAt: "2026-01-01T00:00:00Z", currentReview: { status: "rejected", notes: "Original rejection note", revisionBound } }, preview: { summary: { ideaCount: 1, sourceCount: 0, excerptCount: 0, relationCount: 0, learningSectionCount: 0, ai: null }, learningSections: [], ideas: [idea], relations: [] }, draft: { ideas: [idea], provenance: [], relations: [] }, itemReviews: [{ id: "item-review", targetType: "idea", targetId: "idea", status: "changes_requested", notes: "Source wording needs correction" }] } });
  });
  await page.goto(`${route}?mode=idea`);
  await expect(page.getByText("Review Anda ditolak", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tegaskan penolakan", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toHaveCount(0);
  await capture(page, info, "idea-legacy-rejection-visible");
  await page.getByRole("button", { name: "Tegaskan penolakan", exact: true }).click();
  await expect(page.getByPlaceholder("Catatan review Idea")).toBeDisabled();
  await expect(page.getByPlaceholder("Catatan review Idea")).toHaveValue("Source wording needs correction");
  await expect(page.getByRole("button", { name: "Tegaskan penolakan", exact: true })).toHaveCount(0);
  await capture(page, info, "idea-legacy-rejection-locked");
  expect(errors).toEqual([]);
});

test("Idea content editing locks publication and navigation and discards only explicit edits", async ({ page }, info) => {
  const errors = track(page);
  const ideas = ["idea", "idea-two"].map((id, index) => ({ id, code: `I${index + 1}`, chapterId: "chapter", canonicalStatement: index ? "Kelipatan empat adalah bilangan genap." : "Jumlah dua bilangan genap selalu genap.", conciseExplanation: "Bentuk genap adalah 2k untuk k bulat.", latex: null, knowledgeKind: "principle", instructionalRole: "core", learningSection: null, provenance: [] }));
  let storedIdeas = ideas, submitted: any = null, revised = false;
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/bundles/idea/visual-idea**", async request => {
    if (request.request().method() === "PUT") {
      submitted = request.request().postDataJSON(); await gate; storedIdeas = submitted.draft.ideas; revised = true;
      await request.fulfill({ json: { result: { ok: true } } }); return;
    }
    expect(request.request().method()).toBe("GET");
    await request.fulfill({ json: { bundle: { id: "visual-idea", bundleId: "idea-bundle", courseId: "course", checksum: revised ? "d".repeat(64) : checksum, status: revised ? "validated" : "approved", currentReview: revised ? null : { status: "approved", notes: "", revisionBound: true } }, preview: { summary: { ideaCount: 2, sourceCount: 0, excerptCount: 0, relationCount: 0, learningSectionCount: 0, ai: null }, learningSections: [], ideas: storedIdeas, relations: [] }, draft: { ideas: storedIdeas, provenance: [], relations: [] }, reviewReset: { revision: revised ? "d".repeat(64) : checksum, itemReviewCount: revised ? 0 : 2, bundleReviewCount: revised ? 0 : 1, fingerprint }, itemReviews: ideas.map(idea => ({ id: `review-${idea.id}`, targetType: "idea", targetId: idea.id, status: "approved", notes: null })) } });
  });
  await page.goto(`${route}?mode=workspace-idea`);
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Edit isi", exact: true }).click();
  await page.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
  expect(submitted).toBeNull();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit isi", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Jenis pengetahuan", exact: true })).toBeEnabled();
  await expect(page.getByRole("combobox", { name: "Peran belajar", exact: true })).toBeEnabled();
  const statement = page.getByLabel("Pernyataan utama", { exact: true });
  await statement.fill("Edit yang akan dibatalkan.");
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Idea berikutnya", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Daftar Idea (2)", exact: true })).toBeDisabled();
  await capture(page, info, "idea-content-editor-locks-actions");
  expect(await page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })))).toBe(true);
  await page.getByRole("link", { name: "Kembali ke daftar review", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Perubahan yang belum disimpan");
  await capture(page, info, "idea-workspace-back-protects-content");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(statement).toHaveValue("Edit yang akan dibatalkan.");
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("button", { name: "Idea berikutnya", exact: true }).click();
  await page.getByRole("button", { name: "Edit isi", exact: true }).click();
  await page.getByLabel("Pernyataan utama", { exact: true }).fill("Kelipatan empat dapat ditulis 2(2k).");
  await page.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("termasuk review tertunda dan milik reviewer lain");
  await capture(page, info, "idea-content-save-review-reset-confirmation");
  await page.getByRole("button", { name: "Simpan dan ulangi review", exact: true }).click();
  try {
    await expect(page.getByLabel("Pernyataan utama", { exact: true })).toBeDisabled();
    await expect(page.getByRole("combobox").nth(1)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Batal", exact: true })).toBeDisabled();
    await capture(page, info, "idea-content-save-locks-fields");
  } finally { release(); }
  await expect(page.getByRole("button", { name: "Edit isi", exact: true })).toBeVisible();
  expect(submitted.expectedRevision).toBe(checksum);
  expect(submitted.reviewResetFingerprint).toBe(fingerprint);
  expect(submitted.draft.ideas[0]).toEqual(ideas[0]);
  expect(submitted.draft.ideas[1].canonicalStatement).toBe("Kelipatan empat dapat ditulis 2(2k).");
  await capture(page, info, "idea-content-save-keeps-other-idea");
  expect(errors).toEqual([]);
});

test("structured section notes require save or discard before navigation and bundle decisions", async ({ page }, info) => {
  const errors = track(page);
  const sections = [0, 1].map(index => ({ id: `section-${index}`, kind: "topic", title: index ? "Penjumlahan bilangan genap" : "Bentuk bilangan genap", slug: `section-${index}`, orderIndex: index, learningObjective: "Menjelaskan bentuk genap", ideaIds: ["idea"], sourceRefs: article.sourceRefs, blocks: [{ id: `block-${index}`, blockType: "explanation", orderIndex: 0, ideaIds: ["idea"], sourceRefs: article.sourceRefs, contentMarkdown: "Bilangan genap dapat ditulis sebagai $2k$ dengan $k$ bilangan bulat." }] }));
  const structured = productEntitySchema.parse({ ...article, blocks: [], sections });
  let reviews = sections.map(section => ({ productId: "article", targetType: "article_section", targetId: section.id, status: "approved", notes: "Catatan tersimpan." }));
  let submitted: any = null, decided: any = null;
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const savedCriteria = PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met", reason: "Isi dan sumber sudah diperiksa.", contentAnchors: [{ targetType: "document", targetId: "article" }] }));
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (request.request().method() === "PUT") {
      submitted = request.request().postDataJSON(); await gate;
      const result = { id: "saved-section", ...submitted };
      reviews = reviews.map(review => review.targetId === result.targetId ? result : review);
      await request.fulfill({ json: { result } }); return;
    }
    if (request.request().method() === "POST") { decided = request.request().postDataJSON(); await request.fulfill({ json: { result: { ok: true } } }); return; }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, contentFingerprint: fingerprint, policyVersion: QUALITY_POLICY_VERSION, sections: sections.map(section => ({ articleId: "article", sectionId: section.id, title: section.title, semanticHash: "c".repeat(64) })) } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", courseId: "course", checksum, status: "draft", currentReview: null }, previews: [preview, diktatPreview], draft: { products: [structured, diktat] }, dependencies: [], blockReviews: reviews, qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ ...{ status: "pending" }, productId: diktat.id, revision: checksum }], pdfStatus: { status: "pending" }, pedagogicReview: { id: "ped", status: "approved", policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, criteria: savedCriteria, notes: "" } } });
  });
  await page.goto(`${route}?mode=workspace-product`);
  const note = page.getByLabel("Catatan review", { exact: true });
  await expect(note).toHaveValue("Catatan tersimpan.");
  await expect(page.getByRole("button", { name: "Setujui bundle", exact: true })).toBeEnabled();
  await note.fill("Perubahan catatan yang belum disimpan.");
  await expect(page.getByRole("button", { name: "Setujui bundle", exact: true })).toBeDisabled();
  await expect(page.getByRole("tab", { name: "Metadata", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Render PDF", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Daftar bagian", exact: true }).click();
  await expect(page.getByRole("button").filter({ hasText: "Penjumlahan bilangan genap" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await capture(page, info, "section-unsaved-note-blocks-bundle");
  await page.getByRole("link", { name: "Kembali ke daftar review", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Perubahan yang belum disimpan");
  await capture(page, info, "section-workspace-back-protects-note");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(note).toHaveValue("Perubahan catatan yang belum disimpan.");
  await page.getByRole("button", { name: "Buang perubahan catatan", exact: true }).click();
  await expect(note).toHaveValue("Catatan tersimpan.");
  await expect(page.getByRole("button", { name: "Setujui bundle", exact: true })).toBeEnabled();
  await note.fill("Alasan section yang disimpan dan diaudit.");
  await page.getByRole("button", { name: "Setujui bagian", exact: true }).click();
  try {
    await expect(note).toBeDisabled();
    await expect(page.getByRole("button", { name: "Setujui bundle", exact: true })).toBeDisabled();
    await capture(page, info, "section-save-pending-locks-note");
  } finally { release(); }
  await expect(note).toBeEnabled();
  await expect(note).toHaveValue("Alasan section yang disimpan dan diaudit.");
  await expect(page.getByRole("button", { name: "Setujui bundle", exact: true })).toBeEnabled();
  await capture(page, info, "section-saved-note-matches-decision");
  await page.getByRole("button", { name: "Setujui bundle", exact: true }).click();
  await expect.poll(() => decided?.sectionDecisions?.[0]?.notes).toBe("Alasan section yang disimpan dan diaudit.");
  expect(errors).toEqual([]);
});

test("Idea reset counts include other reviewers and a new pending review requires a fresh confirmation", async ({ page }, info) => {
  const idea = { id: "idea", code: "I1", chapterId: "chapter", canonicalStatement: "Bilangan genap berbentuk 2k.", conciseExplanation: "k adalah bilangan bulat.", latex: null, knowledgeKind: "definition", instructionalRole: "core", learningSection: null, provenance: [] };
  let count = 1, resetFingerprint = fingerprint, attempts = 0;
  const sent: any[] = [];
  await page.route("**/api/admin/bundles/idea/visual-idea**", async request => {
    if (request.request().method() === "PUT") {
      sent.push(request.request().postDataJSON()); attempts++;
      if (attempts === 1) { count = 2; resetFingerprint = "c".repeat(64); await request.fulfill({ status: 409, json: { error: "IDEA_BUNDLE_REVIEW_RESET_STALE" } }); return; }
      await request.fulfill({ json: { result: { ok: true } } }); return;
    }
    await request.fulfill({ json: { bundle: { id: "visual-idea", bundleId: "idea-bundle", courseId: "course", checksum, status: "validated", currentReview: null }, preview: { summary: { ideaCount: 1, sourceCount: 0, excerptCount: 0, relationCount: 0, learningSectionCount: 0, ai: null }, learningSections: [], ideas: [idea], relations: [] }, draft: { ideas: [idea], provenance: [], relations: [] }, itemReviews: [], reviewReset: { revision: checksum, itemReviewCount: count, bundleReviewCount: 1, fingerprint: resetFingerprint } } });
  });
  await page.goto(`${route}?mode=workspace-idea`);
  await page.getByRole("button", { name: "Edit isi", exact: true }).click();
  await page.getByLabel("Pernyataan utama", { exact: true }).fill("Bilangan genap adalah kelipatan dua.");
  await page.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("1 review Idea dan 1 review bundle");
  await capture(page, info, "idea-other-reviewer-reset-counts");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  expect(sent).toHaveLength(0);
  await expect(page.getByLabel("Pernyataan utama", { exact: true })).toHaveValue("Bilangan genap adalah kelipatan dua.");
  await page.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
  await page.getByRole("button", { name: "Simpan dan ulangi review", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("2 review Idea dan 1 review bundle");
  await capture(page, info, "idea-concurrent-pending-review-confirm-again");
  expect(sent[0]).toMatchObject({ expectedRevision: checksum, reviewResetFingerprint: fingerprint });
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(page.getByLabel("Pernyataan utama", { exact: true })).toHaveValue("Bilangan genap adalah kelipatan dua.");
  await page.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
  await page.getByRole("button", { name: "Simpan dan ulangi review", exact: true }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toMatchObject({ expectedRevision: checksum, reviewResetFingerprint: resetFingerprint });
});

test("PDF request binds two targets and locks edits through request and refresh", async ({ page }, info) => {
  const errors = track(page);
  const second = { ...diktat, id: "diktat-two", title: "Diktat kedua" };
  const secondPreview = { ...diktatPreview, id: second.id, title: second.title };
  const products = [article, diktat, second];
  const sent: any[] = [];
  let releasePost: () => void = () => {}, releaseRead: () => void = () => {};
  const postGate = new Promise<void>(resolve => { releasePost = resolve; });
  const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
  let holdRead = false, readStarted = false, ready = new Set<string>();
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const url = new URL(request.request().url());
    if (url.pathname.endsWith("/pdf") && request.request().method() === "POST") {
      const body = request.request().postDataJSON(); sent.push(body);
      if (sent.length === 1) { await postGate; holdRead = true; }
      ready.add(body.productId); await request.fulfill({ status: 202, json: { outcome: "accepted", requestId: body.requestId, attemptId: `attempt-${body.productId}`, duplicate: false, status: "pending" } }); return;
    }
    if (url.pathname.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    if (holdRead) { holdRead = false; readStarted = true; await readGate; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z", currentReview: null }, manifest: { schemaVersion: "product-bundle.v3" }, previews: [preview, diktatPreview, secondPreview], draft: { products }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatus: { status: "select_product" }, pdfStatuses: [diktat, second].map(item => ({ productId: item.id, revision: checksum, status: ready.has(item.id) ? "ready" : "missing", id: ready.has(item.id) ? `attempt-${item.id}` : undefined, pageCount: ready.has(item.id) ? 2 : null })) } });
  });
  await page.goto(`${route}?mode=workspace-product`);
  await page.evaluate(() => window.history.pushState(null, "", "?mode=workspace-product&step=pdf"));
  await expect(page.getByText("Pilih diktat untuk melihat status PDF", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Diktat", exact: true }).click();
  await page.getByRole("region", { name: "Status konten dan PDF" }).getByRole("button", { name: "Render PDF", exact: true }).click();
  try {
    await expect.poll(() => sent.length).toBe(1);
    await expect(page.getByRole("button", { name: "Edit isi", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Bagian berikutnya", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Setujui bundle", exact: true })).toBeDisabled();
    await page.evaluate(() => window.history.back());
    await expect(page.getByRole("dialog")).toContainText("Permintaan masih berlangsung");
    await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
    await expect(page).toHaveURL(/step=pdf/);
    await page.getByRole("link", { name: "Kembali ke daftar review", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Permintaan masih berlangsung");
    await expect(page.getByRole("button", { name: "Tinggalkan halaman", exact: true })).toHaveCount(0);
    await capture(page, info, "pdf-request-pending-locks-navigation");
    releasePost();
    await expect.poll(() => readStarted).toBe(true);
    await expect(page.getByRole("button", { name: "Edit isi", exact: true, includeHidden: true })).toBeDisabled();
    await capture(page, info, "pdf-refresh-pending-locks-navigation");
  } finally { releasePost(); releaseRead(); }
  await expect(page.getByRole("dialog")).toContainText("Perubahan yang belum disimpan");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  const firstHref = await page.getByRole("region", { name: "Status konten dan PDF" }).getByRole("link", { name: "Lihat PDF" }).getAttribute("href");
  expect(new URL(firstHref!, "http://fixture").searchParams.get("productId")).toBe("diktat-one");
  expect(new URL(firstHref!, "http://fixture").searchParams.get("expectedRevision")).toBe(checksum);
  await page.getByRole("button", { name: "Bagian berikutnya", exact: true }).click();
  await page.locator("article").first().getByRole("button", { name: "Render PDF", exact: true }).click();
  await expect(page.getByRole("region", { name: "Status konten dan PDF" }).getByRole("link", { name: "Lihat PDF" })).toBeVisible();
  const secondHref = await page.getByRole("region", { name: "Status konten dan PDF" }).getByRole("link", { name: "Lihat PDF" }).getAttribute("href");
  expect(new URL(secondHref!, "http://fixture").searchParams.get("productId")).toBe("diktat-two");
  expect(new URL(secondHref!, "http://fixture").searchParams.get("expectedRevision")).toBe(checksum);
  const contextualHref = await page.locator("article").first().getByRole("link", { name: /PDF/ }).getAttribute("href");
  expect(new URL(contextualHref!, "http://fixture").searchParams.get("productId")).toBe("diktat-two");
  expect(new URL(contextualHref!, "http://fixture").searchParams.get("expectedRevision")).toBe(checksum);
  expect(sent).toMatchObject([{ productId: "diktat-one", expectedRevision: checksum }, { productId: "diktat-two", expectedRevision: checksum }]);
  expect(sent[0].requestId).toMatch(/^[a-f0-9-]{36}$/); expect(sent[1].requestId).not.toBe(sent[0].requestId);
  await capture(page, info, "pdf-second-target-ready");
  expect(errors).toEqual([]);
});

test("V4 offers trusted verification guidance and previews current receipt evidence", async ({ page }, info) => {
  let ready = false, pdfPosts = 0;
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (path.endsWith("/pdf") && request.request().method() === "POST") { pdfPosts++; await request.fulfill({ json: {} }); return; }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z" }, manifest: { schemaVersion: "product-bundle.v4" }, previews: [diktatPreview, preview], draft: { products: [diktat, article] }, blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, status: ready ? "ready" : "missing", pageCount: ready ? 2 : null }] } });
  });
  await page.goto(`${route}?mode=workspace-product&language=en`);
  await expect(page.getByText("Run trusted V4 verification to create PDF evidence for this revision.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Render PDF/ })).toHaveCount(0);
  await capture(page, info, "v4-trusted-verification-guidance-en");
  ready = true;
  await page.reload();
  const href = await page.getByRole("link", { name: "View PDF", exact: true }).getAttribute("href");
  expect(new URL(href!, "http://fixture").searchParams.get("productId")).toBe(diktat.id);
  expect(new URL(href!, "http://fixture").searchParams.get("expectedRevision")).toBe(checksum);
  expect(pdfPosts).toBe(0);
  await capture(page, info, "v4-receipt-preview-en");
});

for (const withoutNavigationApi of [false, true]) test(`Back and Forward protect a dirty review across productType query views${withoutNavigationApi ? " without Navigation API" : ""}`, async ({ page }, info) => {
  const errors = track(page);
  if (withoutNavigationApi) await page.addInitScript(() => Object.defineProperty(window, "navigation", { value: undefined, configurable: true }));
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z" }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, status: "missing" }] } });
  });
  await page.goto(`${route}?mode=workspace-product`);
  await page.evaluate(() => window.history.pushState(null, "", "?mode=workspace-product&productType=diktat"));
  await page.evaluate(() => window.history.back());
  await expect(page).not.toHaveURL(/productType=/);
  const note = page.getByRole("region", { name: "Review pedagogi" }).locator("fieldset").first().getByRole("textbox");
  await note.fill("Draft tetap ada setelah traversal.");
  await page.evaluate(() => window.history.forward());
  await expect(page.getByRole("dialog")).toContainText("Perubahan yang belum disimpan");
  await expect(page).not.toHaveURL(/productType=/);
  await capture(page, info, "history-forward-confirmation");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(note).toHaveValue("Draft tetap ada setelah traversal.");
  await page.evaluate(() => window.history.forward());
  await page.getByRole("dialog").getByRole("button", { name: "Tinggalkan halaman", exact: true }).click();
  await expect(page).toHaveURL(/productType=diktat/);
  await expect(page.getByRole("tab", { name: "Diktat", exact: true })).toHaveAttribute("data-state", "active");
  await expect(note).toHaveValue("Draft tetap ada setelah traversal.");
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, info, "history-back-confirmation");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(page).toHaveURL(/productType=diktat/);
  await page.evaluate(() => window.history.back());
  await page.getByRole("dialog").getByRole("button", { name: "Tinggalkan halaman", exact: true }).click();
  await expect(page).not.toHaveURL(/productType=/);
  await expect(note).toHaveValue("Draft tetap ada setelah traversal.");
  expect(errors).toEqual([]);
});

test("Idea reset required after an empty summary and revision conflict keeps the old draft", async ({ page }, info) => {
  const idea = { id: "idea", code: "I1", chapterId: "chapter", canonicalStatement: "Bilangan genap berbentuk 2k.", conciseExplanation: "k adalah bilangan bulat.", latex: null, knowledgeKind: "definition", instructionalRole: "core", learningSection: null, provenance: [] };
  let revision = checksum, itemCount = 0, calls = 0;
  const sent: any[] = [];
  await page.route("**/api/admin/bundles/idea/visual-idea**", async request => {
    if (request.request().method() === "PUT") {
      sent.push(request.request().postDataJSON()); calls++;
      if (calls === 1) { itemCount = 1; await request.fulfill({ status: 409, json: { error: "IDEA_BUNDLE_REVIEW_RESET_REQUIRED" } }); return; }
      revision = "d".repeat(64);
      await request.fulfill({ status: 409, json: { error: "IDEA_BUNDLE_REVISION_CONFLICT" } }); return;
    }
    await request.fulfill({ json: { bundle: { id: "visual-idea", bundleId: "idea-bundle", courseId: "course", checksum: revision, status: "validated", currentReview: null }, preview: { summary: { ideaCount: 1, sourceCount: 0, excerptCount: 0, relationCount: 0, learningSectionCount: 0, ai: null }, learningSections: [], ideas: [idea], relations: [] }, draft: { ideas: [idea], provenance: [], relations: [] }, itemReviews: [], reviewReset: { revision, itemReviewCount: itemCount, bundleReviewCount: 0, fingerprint } } });
  });
  await page.goto(`${route}?mode=workspace-idea`);
  await page.getByRole("button", { name: "Edit isi", exact: true }).click();
  await page.getByLabel("Pernyataan utama", { exact: true }).fill("Draft pada revisi lama.");
  await page.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("1 review Idea dan 0 review bundle");
  expect(sent[0].reviewResetFingerprint).toBeUndefined();
  await page.getByRole("button", { name: "Simpan dan ulangi review", exact: true }).click();
  await expect(page.getByText("Revisi telah berubah.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Pernyataan utama", { exact: true })).toHaveValue("Draft pada revisi lama.");
  await expect(page.getByRole("button", { name: "Simpan perubahan", exact: true })).toBeDisabled();
  expect(sent[1]).toMatchObject({ expectedRevision: checksum, reviewResetFingerprint: fingerprint });
  await page.getByRole("button", { name: "Muat revisi terbaru", exact: true }).click();
  await capture(page, info, "idea-new-revision-confirmation");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(page.getByLabel("Pernyataan utama", { exact: true })).toHaveValue("Draft pada revisi lama.");
});

test("stale PDF response preserves the rubric until a new revision is explicitly loaded", async ({ page }, info) => {
  let revision = checksum;
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (path.endsWith("/pdf")) { revision = "d".repeat(64); await request.fulfill({ status: 409, json: { requestId: request.request().postDataJSON().requestId, outcome: "rejected", error: "PRODUCT_BUNDLE_STALE_CONTEXT" } }); return; }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: revision, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum: revision, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z" }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision, status: "missing" }] } });
  });
  await page.goto(`${route}?mode=workspace-product`);
  const note = page.getByRole("region", { name: "Review pedagogi" }).locator("fieldset").first().getByRole("textbox");
  await note.fill("Draft rubrik pada revisi lama.");
  await page.getByRole("region", { name: "Status konten dan PDF" }).getByRole("button", { name: "Render PDF", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Buka revisi baru?" })).toBeVisible();
  await capture(page, info, "pdf-stale-revision-preserves-rubric");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(note).toHaveValue("Draft rubrik pada revisi lama.");
  await expect(page.getByRole("button", { name: "Setujui bundle", exact: true })).toBeDisabled();
});

test("failed PDF context refresh requires retry without discarding the rubric", async ({ page }, info) => {
  let reads = 0, queued = false;
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (path.endsWith("/pdf")) {
      if (request.request().method() === "POST") {
        queued = true; await request.fulfill({ status: 202, json: { outcome: "accepted", requestId: request.request().postDataJSON().requestId, attemptId: "attempt-one", duplicate: false } }); return;
      }
      await request.fulfill({ json: { outcome: "accepted", requestId: new URL(request.request().url()).searchParams.get("requestId"), attemptId: "attempt-one", duplicate: false } }); return;
    }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    reads++;
    if (queued && reads === 2) { await request.fulfill({ status: 503, json: { error: "PRODUCT_BUNDLE_DETAIL_FAILED" } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z" }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, status: queued ? "pending" : "missing", ...(queued ? { id: "attempt-one" } : {}) }] } });
  });
  await page.goto(`${route}?mode=workspace-product`);
  const note = page.getByRole("region", { name: "Review pedagogi" }).locator("fieldset").first().getByRole("textbox");
  await note.fill("Rubrik untuk dipertahankan.");
  await page.getByRole("region", { name: "Status konten dan PDF" }).getByRole("button", { name: "Render PDF", exact: true }).click();
  await expect(page.getByText("Status PDF belum dapat diperbarui. Coba muat ulang status.")).toBeVisible();
  await expect(note).toHaveValue("Rubrik untuk dipertahankan.");
  await expect(note).toBeDisabled();
  await capture(page, info, "pdf-refresh-failed-needs-retry");
  await page.getByRole("link", { name: "Kembali ke daftar review", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Perubahan yang belum disimpan");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Tinggalkan halaman", exact: true })).toBeEnabled();
  await capture(page, info, "pdf-refresh-failed-allows-discard-and-leave");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(note).toHaveValue("Rubrik untuk dipertahankan.");
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(note).toBeEnabled();
  await expect(note).toHaveValue("Rubrik untuk dipertahankan.");
  await capture(page, info, "pdf-refresh-retry-keeps-rubric");
});

test("English Idea editor labels and sidebar review states are accessible", async ({ page }, info) => {
  const errors = track(page);
  const ideas = ["idea", "idea-two"].map((id, index) => ({ id, code: `I${index + 1}`, chapterId: "chapter", canonicalStatement: index ? "Multiples of four are even." : "Even integers have the form 2k.", conciseExplanation: "k is an integer.", latex: null, knowledgeKind: "definition", instructionalRole: "core", learningSection: null, provenance: [] }));
  await page.route("**/api/admin/bundles/idea/visual-idea**", request => request.fulfill({ json: { bundle: { id: "visual-idea", bundleId: "idea-bundle", courseId: "course", checksum, status: "validated", currentReview: null }, structuredReaderEnabled: true, preview: { summary: { ideaCount: 2, sourceCount: 0, excerptCount: 0, relationCount: 0, learningSectionCount: 0, ai: null }, learningSections: [], ideas, relations: [] }, draft: { ideas, provenance: [], relations: [] }, reviewReset: { revision: checksum, itemReviewCount: 2, bundleReviewCount: 0, fingerprint }, itemReviews: ideas.map((idea, index) => ({ id: `review-${idea.id}`, targetType: "idea", targetId: idea.id, status: index ? "changes_requested" : "approved", notes: null })) } }));
  await page.goto(`${route}?mode=workspace-idea&language=en`);
  await expect(page.getByRole("textbox", { name: "Idea review note", exact: true })).toBeVisible();
  if (info.project.name === "laptop-fhd-125") {
    await expect(page.getByRole("button", { name: "I1, Approved", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "I2, Changes requested", exact: true })).toBeVisible();
  }
  await capture(page, info, "idea-english-review-labels-and-statuses");
  await page.getByRole("button", { name: "Edit content", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Knowledge type", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Learning role", exact: true })).toBeVisible();
  await capture(page, info, "idea-english-editor-persistent-labels");
  expect(errors).toEqual([]);
});

for (const language of ["id", "en"]) test(`queued PDF has explicit draft-preserving status refresh and no duplicate requests ${language}`, async ({ page }, info) => {
  const errors = track(page);
  let pdf: { status: string; id?: string; pageCount?: number } = { status: "missing" };
  let posts = 0;
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (path.endsWith("/pdf") && request.request().method() === "POST") { posts++; pdf = { status: "pending", id: posts === 1 ? "attempt-one" : "attempt-two" }; await request.fulfill({ status: 202, json: { outcome: "accepted", requestId: request.request().postDataJSON().requestId, attemptId: pdf.id, duplicate: false, status: "pending" } }); return; }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z" }, manifest: { schemaVersion: "product-bundle.v3" }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, ...pdf }] } });
  });
  await page.goto(`${route}?mode=workspace-product&language=${language}`);
  const panel = page.getByRole("region", { name: language === "id" ? "Status konten dan PDF" : "Content and PDF status" });
  const note = page.locator("fieldset").getByRole("textbox").first();
  const draft = "Draft rubric remains while the queued renderer runs.";
  await note.fill(draft);
  await panel.getByRole("button", { name: "Render PDF", exact: true }).click();
  const refresh = () => panel.getByRole("button", { name: language === "id" ? "Perbarui status PDF" : "Refresh PDF status", exact: true });
  await expect(refresh()).toBeEnabled();
  await expect(panel.getByRole("status")).toContainText(language === "id" ? "PDF menunggu proses" : "PDF is pending");
  await expect(panel.getByRole("button", { name: "Render PDF", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Render PDF", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
  expect(posts).toBe(1);
  await expect(note).toHaveValue(draft);
  await capture(page, info, "queued-before-worker-writes-evidence");
  pdf = { status: "pending", id: "attempt-one" };
  await refresh().click();
  await expect(refresh()).toBeEnabled();
  await expect(note).toHaveValue(draft);
  await capture(page, info, "worker-pending-with-explicit-refresh");
  pdf = { status: "ready", id: "attempt-one", pageCount: 1 };
  await refresh().click();
  await expect(panel.getByRole("link", { name: language === "id" ? "Lihat PDF" : "View PDF" })).toBeVisible();
  await expect(note).toHaveValue(draft);
  await expect(panel.getByRole("status")).toContainText(language === "id" ? "PDF siap" : "PDF is ready");
  await capture(page, info, "worker-ready-after-refresh");
  await page.getByRole("tab", { name: "Diktat", exact: true }).click();
  await page.locator("article").getByRole("button", { name: language === "id" ? "Render ulang PDF" : "Render PDF again", exact: true }).click();
  await expect(refresh()).toBeEnabled();
  await expect(panel.getByRole("link", { name: language === "id" ? "Lihat PDF" : "View PDF" })).toHaveCount(0);
  expect(posts).toBe(2);
  await capture(page, info, "rerender-does-not-reuse-old-ready-evidence");
  pdf = { status: "ready", id: "attempt-two", pageCount: 2 };
  await refresh().click();
  await expect(refresh()).toHaveCount(0);
  await expect(panel.getByRole("link", { name: language === "id" ? "Lihat PDF" : "View PDF" })).toBeVisible();
  await expect(note).toHaveValue(draft);
  expect(errors).toEqual([]);
});

test("multi-entry Back and Forward restore the marked origin without Navigation API", async ({ page }, info) => {
  const errors = track(page);
  await page.addInitScript(() => Object.defineProperty(window, "navigation", { value: undefined, configurable: true }));
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    if (new URL(request.request().url()).pathname.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z" }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, status: "missing" }] } });
  });
  await page.goto(`${route}?mode=workspace-product&step=0`);
  await expect(page.getByRole("region", { name: "Status konten dan PDF" }).getByRole("button", { name: "Render PDF", exact: true })).toBeEnabled();
  await page.evaluate(() => { for (let step = 1; step <= 3; step++) window.history.pushState(null, "", `?mode=workspace-product&step=${step}`); window.history.go(-3); });
  await expect(page).toHaveURL(/step=0/);
  const note = page.getByRole("region", { name: "Review pedagogi" }).locator("fieldset").first().getByRole("textbox");
  await note.fill("Draft survives multi-entry traversal.");
  await page.evaluate(() => window.history.go(3));
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/step=0/);
  await capture(page, info, "multi-entry-forward-restored-origin");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(note).toHaveValue("Draft survives multi-entry traversal.");
  await page.evaluate(() => window.history.go(3));
  await page.getByRole("dialog").getByRole("button", { name: "Tinggalkan halaman", exact: true }).click();
  await expect(page).toHaveURL(/step=3/);
  await page.evaluate(() => window.history.go(-3));
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/step=3/);
  await capture(page, info, "multi-entry-back-restored-origin");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(note).toHaveValue("Draft survives multi-entry traversal.");
  await page.evaluate(() => window.history.go(-3));
  await page.getByRole("dialog").getByRole("button", { name: "Tinggalkan halaman", exact: true }).click();
  await expect(page).toHaveURL(/step=0/);
  await expect(note).toHaveValue("Draft survives multi-entry traversal.");
  expect(errors).toEqual([]);
});

test("accepted PDF attempts survive reload and another tab and recover before a worker starts", async ({ page }, info) => {
  const errors = track(page);
  let posts = 0;
  let pdf: { status: string; id?: string; failureCode?: string; pageCount?: number } = { status: "ready", id: "old-ready", pageCount: 1 };
  await page.context().route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (path.endsWith("/pdf") && request.request().method() === "POST") {
      posts++;
      pdf = { status: "pending", id: `accepted-attempt-${posts}` };
      await request.fulfill({ status: 202, json: { outcome: "accepted", requestId: request.request().postDataJSON().requestId, status: "pending", attemptId: pdf.id, duplicate: false } }); return;
    }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z", currentReview: { status: "approved", notes: "" } }, manifest: { schemaVersion: "product-bundle.v3" }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: pdf.status === "ready", issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, ...pdf }] } });
  });
  await page.goto(`${route}?mode=workspace-product`);
  await page.getByRole("tab", { name: "Diktat", exact: true }).click();
  await page.locator("article").getByRole("button", { name: "Render ulang PDF", exact: true }).click();
  const panel = (target: Page) => target.getByRole("region", { name: "Status konten dan PDF" });
  await expect(panel(page).getByRole("status")).toContainText("PDF menunggu proses");
  await page.reload();
  await expect(panel(page).getByRole("button", { name: "Render PDF", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeDisabled();
  await capture(page, info, "accepted-attempt-after-reload-before-worker");
  const second = await page.context().newPage();
  const secondErrors = track(second);
  try {
    await second.goto(`${route}?mode=workspace-product`);
    await expect(panel(second).getByRole("button", { name: "Render PDF", exact: true })).toBeDisabled();
    await expect(second.getByRole("button", { name: "Publikasikan", exact: true })).toBeDisabled();
    await panel(second).getByRole("button", { name: "Render PDF", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
    expect(posts).toBe(1);
    await capture(second, info, "accepted-attempt-in-second-tab-before-worker");
    pdf = { status: "failed", id: "accepted-attempt-1", failureCode: "RENDER_UNAVAILABLE" };
    await panel(page).getByRole("button", { name: "Perbarui status PDF", exact: true }).click();
    await expect(panel(page).getByRole("status")).toContainText("Render PDF gagal");
    await capture(page, info, "accepted-attempt-enqueue-failed-retry-available");
    await panel(page).getByRole("button", { name: "Render ulang PDF", exact: true }).click();
    await expect(panel(page).getByRole("status")).toContainText("PDF menunggu proses");
    expect(posts).toBe(2);
    pdf = { status: "failed", id: "accepted-attempt-2", failureCode: "RENDER_TIMEOUT" };
    await panel(second).getByRole("button", { name: "Perbarui status PDF", exact: true }).click();
    await expect(panel(second).getByRole("button", { name: "Render ulang PDF", exact: true })).toBeEnabled();
    await capture(second, info, "accepted-attempt-timeout-retry-available");
    await panel(second).getByRole("button", { name: "Render ulang PDF", exact: true }).click();
    await expect(panel(second).getByRole("status")).toContainText("PDF menunggu proses");
    expect(posts).toBe(3);
    pdf = { status: "ready", id: "accepted-attempt-3", pageCount: 2 };
    await panel(second).getByRole("button", { name: "Perbarui status PDF", exact: true }).click();
    await expect(panel(second).getByRole("link", { name: "Lihat PDF", exact: true })).toBeVisible();
    await capture(second, info, "accepted-attempt-retry-ready");
    expect(secondErrors).toEqual([]);
  } finally { await second.close(); }
  expect(errors).toEqual([]);
});

for (const withoutNavigationApi of [false, true]) test(`dirty Product tab replacement preserves the history origin${withoutNavigationApi ? " without Navigation API" : ""}`, async ({ page }, info) => {
  const errors = track(page);
  if (withoutNavigationApi) await page.addInitScript(() => Object.defineProperty(window, "navigation", { value: undefined, configurable: true }));
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    if (new URL(request.request().url()).pathname.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z" }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, status: "missing" }] } });
  });
  await page.goto(`${route}?mode=workspace-product&step=before`);
  await expect(page.getByRole("region", { name: "Status konten dan PDF" }).getByRole("button", { name: "Render PDF", exact: true })).toBeEnabled();
  await page.evaluate(() => { window.history.pushState(null, "", "?mode=workspace-product&step=origin"); (window as any).__reviewDocument = "same-document"; });
  const note = page.getByRole("region", { name: "Review pedagogi" }).locator("fieldset").first().getByRole("textbox");
  await note.fill("Draft before replacing the tab URL.");
  const marker = await page.evaluate(() => window.history.state?.__materialReviewGuard);
  expect(marker).toBeTruthy();
  await page.getByRole("tab", { name: "Diktat", exact: true }).click();
  await expect(page).toHaveURL(/productType=diktat/);
  expect(await page.evaluate(() => window.history.state?.__materialReviewGuard)).toBe(marker);
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/step=origin&productType=diktat/);
  await capture(page, info, "dirty-tab-replacement-restores-origin");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(note).toHaveValue("Draft before replacing the tab URL.");
  await page.evaluate(() => window.history.back());
  await page.getByRole("dialog").getByRole("button", { name: "Tinggalkan halaman", exact: true }).click();
  await expect(page).toHaveURL(/step=before/);
  await expect(page.getByRole("tab", { name: "Semua", exact: true })).toHaveAttribute("data-state", "active");
  await page.evaluate(() => window.history.forward());
  await page.getByRole("dialog").getByRole("button", { name: "Tinggalkan halaman", exact: true }).click();
  await expect(page).toHaveURL(/step=origin&productType=diktat/);
  await expect(note).toHaveValue("Draft before replacing the tab URL.");
  expect(await page.evaluate(() => (window as any).__reviewDocument)).toBe("same-document");
  expect(errors).toEqual([]);
});

for (const withoutNavigationApi of [false, true]) test(`dirty V5 item history retains drafts without a leave warning${withoutNavigationApi ? " without Navigation API" : ""}`, async ({ page }, info) => {
  const errors = track(page);
  if (withoutNavigationApi) await page.addInitScript(() => Object.defineProperty(window, "navigation", { value: undefined, configurable: true }));
  await installReviewMock(page);
  await page.addInitScript(() => { (window as any).__solutionReviewMock.revision = "a".repeat(64); });
  await page.route("**/api/admin/bundles/product/visual-product", async request => {
    const collection = structuredClone(solutionCollectionFixture);
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "solution-bundle", courseId: "course", checksum, status: "draft", createdAt: "2026-01-01T00:00:00Z" }, previews: [{ id: collection.id, productType: "solution_collection", title: collection.title, version: 1, status: "draft", traceability: { ideaIds: [], sourceIds: [] }, sections: [] }], draft: { products: [{ id: collection.id, productType: "solution_collection", title: collection.title, version: 1, collection }] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] } } });
  });
  await page.goto(`${route}?mode=workspace-product`);
  const note = page.getByLabel("Catatan", { exact: true });
  await expect(note).toBeEnabled();
  await note.fill("Draft on triangle.");
  await page.evaluate(() => { (window as any).__reviewDocument = "same-document"; });
  const firstMarker = await page.evaluate(() => window.history.state?.__materialReviewGuard);
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(page).toHaveURL(/item=python-loop/);
  await expect(page.getByRole("heading", { name: "Menelusuri perulangan Python", exact: true })).toBeVisible();
  const secondMarker = await page.evaluate(() => window.history.state?.__materialReviewGuard);
  expect(secondMarker).toBeTruthy(); expect(secondMarker).not.toBe(firstMarker);
  await note.fill("Draft on Python.");
  await page.evaluate(() => window.history.back());
  await expect(page).not.toHaveURL(/item=/);
  await expect(note).toHaveValue("Draft on triangle.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await capture(page, info, "dirty-item-back-keeps-draft-without-warning");
  await page.evaluate(() => window.history.forward());
  await expect(page).toHaveURL(/item=python-loop/);
  await expect(note).toHaveValue("Draft on Python.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await capture(page, info, "dirty-item-forward-keeps-draft-without-warning");
  await page.evaluate(() => { (window as any).__solutionReviewMock.delayContext = true; });
  await page.getByRole("button", { name: "Muat ulang status", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__solutionReviewMock.releaseContext))).toBe(true);
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Tinggalkan halaman", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/item=python-loop/);
  await capture(page, info, "pending-item-history-remains-guarded");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await page.evaluate(() => (window as any).__solutionReviewMock.releaseContext());
  await expect(note).toBeEnabled();
  await expect(note).toHaveValue("Draft on Python.");
  await page.getByRole("link", { name: "Kembali ke daftar review", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Tinggalkan halaman", exact: true })).toBeVisible();
  await capture(page, info, "leaving-review-after-item-history-remains-guarded");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(note).toHaveValue("Draft on Python.");
  expect(await page.evaluate(() => (window as any).__reviewDocument)).toBe("same-document");
  expect(errors).toEqual([]);
});

test("lost PDF response keeps correlation through unknown, processing, reload and retry", async ({ page }, info) => {
  const errors = track(page);
  const posts: any[] = [], outcomes: string[] = [];
  let phase: "unknown" | "processing" | "accepted" = "unknown";
  let pdf = { status: "ready", id: "old-ready", pageCount: 1 };
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const url = new URL(request.request().url());
    if (url.pathname.endsWith("/pdf")) {
      if (request.request().method() === "POST") { posts.push(request.request().postDataJSON()); await request.abort("failed"); return; }
      expect(url.searchParams.get("productId")).toBe(diktat.id);
      expect(url.searchParams.get("expectedRevision")).toBe(checksum);
      outcomes.push(phase);
      await request.fulfill({ json: { requestId: url.searchParams.get("requestId"), outcome: phase, ...(phase === "accepted" ? { attemptId: "accepted-attempt", duplicate: false } : {}) } }); return;
    }
    if (url.pathname.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z", currentReview: { status: "approved", notes: "" } }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: true, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, ...pdf }] } });
  });
  await page.goto(`${route}?mode=workspace-product&keep=present`);
  await page.getByRole("tab", { name: "Diktat", exact: true }).click();
  await page.locator("article").getByRole("button", { name: "Render ulang PDF", exact: true }).click();
  const panel = page.getByRole("region", { name: "Status konten dan PDF" });
  await expect.poll(() => outcomes).toEqual(["unknown"]);
  await expect(panel.getByRole("status")).toContainText("Status PDF belum diketahui");
  await expect(page.locator('a[href*="/pdf?"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeDisabled();
  await expect(page.locator("article").getByRole("button", { name: "Render PDF", exact: true })).toBeDisabled();
  const requestId = posts[0].requestId;
  expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(new URL(page.url()).searchParams.get("pdfRequestId")).toBe(requestId);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("present");
  await capture(page, info, "pdf-lost-unknown-before-registration");
  await page.getByRole("link", { name: "Kembali ke daftar review", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Tinggalkan halaman", exact: true })).toBeEnabled();
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  phase = "processing";
  await panel.getByRole("button", { name: "Periksa status", exact: true }).click();
  await expect.poll(() => outcomes).toEqual(["unknown", "processing"]);
  await expect(panel.getByRole("status")).toContainText("Status PDF belum diketahui");
  await capture(page, info, "pdf-lost-processing-old-ready-hidden");
  page.once("dialog", dialog => void dialog.accept());
  await page.reload();
  await expect(panel.getByRole("status")).toContainText("Status PDF belum diketahui");
  await expect(page.locator('a[href*="/pdf?"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Ulangi permintaan", exact: true }).click();
  await expect.poll(() => posts.length).toBe(2);
  await expect.poll(() => outcomes.length).toBe(3);
  expect(posts[1]).toEqual(posts[0]);
  await capture(page, info, "pdf-lost-reload-same-request-retry");
  phase = "accepted";
  await panel.getByRole("button", { name: "Periksa status", exact: true }).click();
  await expect.poll(() => outcomes.length).toBe(4);
  await expect(panel.getByRole("status")).toContainText("Status PDF belum diketahui");
  await expect(page.locator('a[href*="/pdf?"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeDisabled();
  await capture(page, info, "pdf-accepted-old-ready-still-hidden");
  pdf = { status: "pending", id: "accepted-attempt", pageCount: 0 };
  await panel.getByRole("button", { name: "Periksa status", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("PDF menunggu proses");
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeDisabled();
  expect(new URL(page.url()).searchParams.has("pdfRequestId")).toBe(false);
  await capture(page, info, "pdf-correlated-accepted-pending");
  pdf = { status: "ready", id: "accepted-attempt", pageCount: 2 };
  await panel.getByRole("button", { name: "Perbarui status PDF", exact: true }).click();
  await expect(panel.getByRole("link", { name: "Lihat PDF", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeEnabled();
  await capture(page, info, "pdf-correlated-attempt-ready");
  expect(errors.filter(error => !error.includes("net::ERR_FAILED"))).toEqual([]);
});

for (const bundleStatus of ["draft", "published"] as const) test(`restored PDF request settles the original scope after a revision change${bundleStatus === "published" ? " on a published import" : ""}`, async ({ page }, info) => {
  const observedErrors = track(page);
  const requestId = "11111111-1111-4111-8111-111111111111";
  const newRevision = "d".repeat(64);
  let posts = 0, lookups = 0;
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const url = new URL(request.request().url());
    if (url.pathname.endsWith("/pdf")) {
      if (request.request().method() === "POST") {
        posts++;
        expect(request.request().postDataJSON()).toEqual({ requestId, productId: diktat.id, expectedRevision: checksum });
        await request.fulfill({ status: 409, json: { requestId, outcome: "rejected", error: "PRODUCT_BUNDLE_STALE_CONTEXT" } }); return;
      }
      lookups++;
      expect(url.searchParams.get("expectedRevision")).toBe(checksum);
      expect(url.searchParams.get("requestId")).toBe(requestId);
      await request.fulfill({ json: { requestId, outcome: "unknown" } }); return;
    }
    if (url.pathname.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: newRevision, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum: newRevision, status: bundleStatus, courseId: "course", createdAt: "2026-01-01T00:00:00Z", currentReview: { status: "approved", notes: "" } }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: true, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: newRevision, status: "ready", id: "new-revision-ready" }] } });
  });
  const params = new URLSearchParams({ mode: "workspace-product", pdfImportId: "visual-product", pdfProductId: diktat.id, pdfRevision: checksum, pdfRequestId: requestId });
  await page.goto(`${route}?${params}`);
  const panel = page.getByRole("region", { name: "Status konten dan PDF" });
  await expect(panel.getByRole("status")).toContainText("Status PDF belum diketahui");
  await expect(panel.getByRole("button", { name: "Selesaikan permintaan lama", exact: true })).toBeEnabled();
  if (bundleStatus === "draft") await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Periksa status", exact: true }).click();
  await expect.poll(() => lookups).toBe(1);
  expect(posts).toBe(0);
  await capture(page, info, "pdf-restored-different-revision-offers-settlement");
  await panel.getByRole("button", { name: "Selesaikan permintaan lama", exact: true }).click();
  await expect.poll(() => posts).toBe(1);
  if (bundleStatus === "draft") {
    await expect(panel.getByRole("link", { name: "Lihat PDF", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeEnabled();
  } else {
    await expect(panel).toHaveCount(0);
    await expect(page.getByText("Telah dipublikasikan", { exact: true })).toBeVisible();
    await expect(page.locator("#product-review-note")).toBeDisabled();
  }
  expect(new URL(page.url()).searchParams.has("pdfRequestId")).toBe(false);
  await capture(page, info, "pdf-stale-original-request-settled");
  expect(observedErrors.filter(error => !error.startsWith("409 ") && !error.includes("status of 409"))).toEqual([]);
});

for (const initial of ["missing", "failed", "ready"] as const) test(`rejected PDF request keeps the error with ${initial} evidence and retries with a new UUID`, async ({ page }, info) => {
  const posts: any[] = [];
  let pdf = { status: initial as string, id: initial === "missing" ? undefined : `old-${initial}` };
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (path.endsWith("/pdf") && request.request().method() === "POST") {
      const body = request.request().postDataJSON(); posts.push(body);
      if (posts.length === 1) { await request.fulfill({ status: 422, json: { requestId: body.requestId, outcome: "rejected", error: "PRODUCT_DIKTAT_SOURCE_MISSING" } }); return; }
      pdf = { status: "pending", id: "retry-attempt" };
      await request.fulfill({ status: 202, json: { requestId: body.requestId, outcome: "accepted", attemptId: "retry-attempt", duplicate: false } }); return;
    }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z" }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, ...pdf }] } });
  });
  await page.goto(`${route}?mode=workspace-product`);
  const panel = page.getByRole("region", { name: "Status konten dan PDF" });
  const render = () => panel.getByRole("button", { name: initial === "missing" ? "Render PDF" : "Render ulang PDF", exact: true });
  if (initial === "ready") {
    await page.getByRole("tab", { name: "Diktat", exact: true }).click();
    await page.locator("article").getByRole("button", { name: "Render ulang PDF", exact: true }).click();
  } else await render().click();
  await expect(panel.getByText("Permintaan PDF ditolak. Coba render lagi.")).toBeVisible();
  await expect(render()).toBeEnabled();
  await capture(page, info, `pdf-rejected-${initial}-retains-error`);
  await render().click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].requestId).not.toBe(posts[0].requestId);
  expect(posts[1]).toMatchObject({ productId: posts[0].productId, expectedRevision: posts[0].expectedRevision });
  await expect(panel.getByRole("status")).toContainText("PDF menunggu proses");
  await capture(page, info, `pdf-rejected-${initial}-new-request-pending`);
});

test("accepted queue failure reads its exact failed attempt before allowing a new request", async ({ page }, info) => {
  const posts: any[] = [];
  let pdf: { status: string; id?: string } = { status: "ready", id: "old-ready" };
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (path.endsWith("/pdf") && request.request().method() === "POST") {
      const body = request.request().postDataJSON(); posts.push(body);
      pdf = { status: "failed", id: `failed-attempt-${posts.length}` };
      await request.fulfill({ status: 503, json: { requestId: body.requestId, outcome: "accepted", attemptId: pdf.id, duplicate: false, error: "PRODUCT_DIKTAT_PDF_QUEUE_UNAVAILABLE" } }); return;
    }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z" }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, ...pdf }] } });
  });
  await page.goto(`${route}?mode=workspace-product`);
  await page.getByRole("tab", { name: "Diktat", exact: true }).click();
  await page.locator("article").getByRole("button", { name: "Render ulang PDF", exact: true }).click();
  const panel = page.getByRole("region", { name: "Status konten dan PDF" });
  await expect(panel.getByRole("status")).toContainText("Render PDF gagal");
  await expect(panel.getByRole("button", { name: "Render ulang PDF", exact: true })).toBeEnabled();
  await expect(panel.getByRole("link", { name: "Lihat PDF", exact: true })).toHaveCount(0);
  await capture(page, info, "pdf-accepted-queue-failure");
  await panel.getByRole("button", { name: "Render ulang PDF", exact: true }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].requestId).not.toBe(posts[0].requestId);
});

test("superseded accepted PDF recovery adopts the attested current attempt", async ({ page }, info) => {
  const observedErrors = track(page);
  const requestId = "33333333-3333-4333-8333-333333333333";
  let ready = false;
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const url = new URL(request.request().url());
    if (url.pathname.endsWith("/pdf")) { await request.fulfill({ json: { requestId, outcome: "accepted", attemptId: "accepted-a", supersededByAttemptId: "local-operator-b", duplicate: false } }); return; }
    if (url.pathname.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z", currentReview: { status: "approved", notes: "" } }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: ready, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, id: "local-operator-b", status: ready ? "ready" : "pending", pageCount: ready ? 2 : 0 }] } });
  });
  const params = new URLSearchParams({ mode: "workspace-product", pdfImportId: "visual-product", pdfProductId: diktat.id, pdfRevision: checksum, pdfRequestId: requestId });
  await page.goto(`${route}?${params}`);
  const panel = page.getByRole("region", { name: "Status konten dan PDF" });
  await panel.getByRole("button", { name: "Periksa status", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("PDF menunggu proses");
  expect(new URL(page.url()).searchParams.has("pdfRequestId")).toBe(false);
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeDisabled();
  await capture(page, info, "pdf-superseded-attested-pending");
  ready = true;
  await panel.getByRole("button", { name: "Perbarui status PDF", exact: true }).click();
  await expect(panel.getByRole("link", { name: "Lihat PDF", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeEnabled();
  await capture(page, info, "pdf-superseded-attested-ready");
  expect(observedErrors).toEqual([]);
});

test("another admin can abandon only local PDF tracking after reading server readiness", async ({ page }, info) => {
  const observedErrors = track(page);
  const requestId = "44444444-4444-4444-8444-444444444444";
  let detailReads = 0;
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const path = new URL(request.request().url()).pathname;
    if (path.endsWith("/pdf")) { await request.fulfill({ status: 409, json: { error: "PRODUCT_DIKTAT_REQUEST_CONFLICT" } }); return; }
    if (path.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    detailReads++;
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z", currentReview: { status: "approved", notes: "" } }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, id: "original-admin-attempt", status: "pending" }] } });
  });
  const params = new URLSearchParams({ mode: "workspace-product", language: "en", pdfImportId: "visual-product", pdfProductId: diktat.id, pdfRevision: checksum, pdfRequestId: requestId });
  await page.goto(`${route}?${params}`);
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("another account or target");
  await expect(page.getByRole("button", { name: "Retry request", exact: true })).toBeDisabled();
  await capture(page, info, "pdf-account-conflict-recovery");
  const before = detailReads;
  await page.getByRole("button", { name: "Check server and stop tracking", exact: true }).click();
  await expect.poll(() => detailReads).toBeGreaterThan(before);
  await expect(page.getByText("PDF is pending", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("pdfRequestId")).toBe(false);
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  await capture(page, info, "pdf-other-account-server-pending-retained");
  expect(observedErrors.filter(error => !error.startsWith("409 ") && !error.includes("status of 409"))).toEqual([]);
});

test("failed V5 save keeps the navigation guard when tab storage is unavailable", async ({ page }, info) => {
  const observedErrors = track(page);
  await installReviewMock(page);
  await page.addInitScript(() => {
    (window as any).__solutionReviewMock.revision = "a".repeat(64);
    (window as any).__solutionReviewMock.failSave = true;
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("Unavailable", "SecurityError"); } });
  });
  await page.route("**/api/admin/bundles/product/visual-product", async request => {
    const collection = structuredClone(solutionCollectionFixture);
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "solution-bundle", courseId: "course", checksum, status: "draft", createdAt: "2026-01-01T00:00:00Z" }, previews: [{ id: collection.id, productType: "solution_collection", title: collection.title, version: 1, status: "draft", traceability: { ideaIds: [], sourceIds: [] }, sections: [] }], draft: { products: [{ id: collection.id, productType: "solution_collection", title: collection.title, version: 1, collection }] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] } } });
  });
  await page.goto(`${route}?mode=workspace-product`);
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeEnabled();
  await decideItem(page, "Disetujui");
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await decideItem(page, "Disetujui");
  const note = page.getByLabel("Catatan", { exact: true });
  await note.fill("Draft setelah kegagalan simpan.");
  await page.getByRole("button", { name: "Setujui bundle", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Review belum tersimpan");
  await page.getByRole("link", { name: "Kembali ke daftar review", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, info, "failed-v5-save-storage-unavailable-leave-guard");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(note).toHaveValue("Draft setelah kegagalan simpan.");
  await capture(page, info, "failed-v5-save-draft-retained");
  expect(observedErrors).toEqual([]);
});

for (const responseMode of ["stale", "mismatched"] as const) test(`V5 ${responseMode} context retains the last baseline and unsaved navigation guard`, async ({ page }, info) => {
  const errors = track(page);
  await installReviewMock(page);
  await page.addInitScript(({ mode }) => {
    const state = (window as any).__solutionReviewMock;
    state.revision = "a".repeat(64);
    const original = window.fetch.bind(window);
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("Unavailable", "SecurityError"); } });
    window.fetch = Object.assign(async (input: Parameters<typeof window.fetch>[0], init?: Parameters<typeof window.fetch>[1]) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (state.staleContext && url.includes("/solution-review") && init?.method !== "POST") {
        state.contextRevisionRequested = new URL(url, location.origin).searchParams.get("expectedRevision");
        if (mode === "stale") return new Response(JSON.stringify({ error: "PRODUCT_BUNDLE_STALE_CONTEXT" }), { status: 409 });
        return new Response(JSON.stringify({ result: { revision: "d".repeat(64), productId: "collection-demo", reviewerId: "fixture-reviewer", savedReview: null, reviewVersion: "c".repeat(64), itemHashes: [{ itemId: "triangle-area", itemHash: "changed-triangle" }, { itemId: "python-loop", itemHash: "changed-python" }] } }));
      }
      return original(input, init);
    }, original);
  }, { mode: responseMode });
  await page.route("**/api/admin/bundles/product/visual-product", async request => {
    const collection = structuredClone(solutionCollectionFixture);
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "solution-bundle", courseId: "course", checksum, status: "draft", createdAt: "2026-01-01T00:00:00Z" }, previews: [{ id: collection.id, productType: "solution_collection", title: collection.title, version: 1, status: "draft", traceability: { ideaIds: [], sourceIds: [] }, sections: [] }], draft: { products: [{ id: collection.id, productType: "solution_collection", title: collection.title, version: 1, collection }] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] } } });
  });
  await page.goto(`${route}?mode=workspace-product`);
  const note = page.getByLabel("Catatan", { exact: true });
  await expect(note).toBeEnabled();
  await note.fill("Draft sebelum respons revisi lain.");
  await page.evaluate(() => { (window as any).__solutionReviewMock.staleContext = true; });
  await page.getByRole("button", { name: "Muat ulang status", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Review belum dapat dimuat");
  await expect(note).toHaveValue("Draft sebelum respons revisi lain.");
  await expect(note).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__solutionReviewMock.contextRevisionRequested)).toBe(checksum);
  await capture(page, info, `v5-${responseMode}-context-preserves-draft`);
  await page.getByRole("link", { name: "Kembali ke daftar review", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, info, `v5-${responseMode}-context-keeps-leave-warning`);
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(note).toHaveValue("Draft sebelum respons revisi lain.");
  expect(errors).toEqual([]);
});

test("English correlated PDF recovery exposes status and rejection actions", async ({ page }, info) => {
  const errors = track(page);
  const requestId = "22222222-2222-4222-8222-222222222222";
  let outcome = "unknown";
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    const url = new URL(request.request().url());
    if (url.pathname.endsWith("/pdf")) {
      expect(url.searchParams.get("requestId")).toBe(requestId);
      await request.fulfill({ json: { requestId, outcome, ...(outcome === "rejected" ? { error: "PRODUCT_DIKTAT_SOURCE_MISSING" } : {}) } }); return;
    }
    if (url.pathname.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z" }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, status: "missing" }] } });
  });
  const params = new URLSearchParams({ mode: "workspace-product", language: "en", pdfImportId: "visual-product", pdfProductId: diktat.id, pdfRevision: checksum, pdfRequestId: requestId });
  await page.goto(`${route}?${params}`);
  const check = page.getByRole("button", { name: "Check status", exact: true });
  await expect(check).toBeEnabled();
  await expect(page.getByRole("button", { name: "Retry request", exact: true })).toBeEnabled();
  await check.click();
  await expect(page.getByText("PDF status is unknown", { exact: true })).toBeVisible();
  await capture(page, info, "pdf-english-correlated-unknown");
  outcome = "rejected";
  await check.click();
  await expect(page.getByText("The PDF request was rejected. Try rendering again.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Render PDF", exact: true })).toBeEnabled();
  await capture(page, info, "pdf-english-correlated-rejected");
  expect(errors).toEqual([]);
});

test("unknown history positions never probe into the different document after a forward target", async ({ page }, info) => {
  const errors = track(page);
  let nativePrompts = 0;
  page.on("dialog", async dialog => { nativePrompts++; await dialog.dismiss(); });
  await page.addInitScript(() => {
    Object.defineProperty(window, "navigation", { value: undefined, configurable: true });
    const replace = window.history.replaceState;
    (window as any).__rawHistoryReplace = (data: unknown) => replace.call(window.history, data, "", window.location.href);
  });
  await page.route("**/api/admin/bundles/product/visual-product**", async request => {
    if (new URL(request.request().url()).pathname.endsWith("/review")) { await request.fulfill({ json: { expectedRevision: checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, sections: [] } }); return; }
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "bundle", checksum, status: "draft", courseId: "course", createdAt: "2026-01-01T00:00:00Z" }, previews: [preview, diktatPreview], draft: { products: [article, diktat] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] }, pdfStatuses: [{ productId: diktat.id, revision: checksum, status: "missing" }] } });
  });
  await page.goto(`${route}?mode=workspace-product&entry=origin`);
  const ready = () => page.getByRole("region", { name: "Status konten dan PDF" }).getByRole("button", { name: "Render PDF", exact: true });
  await expect(ready()).toBeEnabled();
  await page.evaluate(() => window.history.pushState(null, "", "?mode=workspace-product&entry=target"));
  await page.goto("/visual-fixtures/solution-collection?different-document=1");
  await page.goBack();
  await expect(page).toHaveURL(/entry=target/);
  await expect(ready()).toBeEnabled();
  await page.evaluate(() => {
    const data = { ...window.history.state };
    delete data.__materialReviewPosition;
    delete data.__materialReviewGuard;
    (window as any).__rawHistoryReplace(data);
  });
  await page.goBack();
  await expect(page).toHaveURL(/entry=origin/);
  const note = page.getByRole("region", { name: "Review pedagogi" }).locator("fieldset").first().getByRole("textbox");
  await note.fill("Draft stays here when the forward target is untracked.");
  await page.evaluate(() => { (window as any).__reviewDocument = "origin-document"; window.history.forward(); });
  await expect(page.getByRole("dialog")).toContainText("Perubahan yang belum disimpan");
  await expect(page).toHaveURL(/entry=origin/);
  expect(nativePrompts).toBe(0);
  expect(await page.evaluate(() => (window as any).__reviewDocument)).toBe("origin-document");
  await capture(page, info, "untracked-forward-target-reanchors-without-unload");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(note).toHaveValue("Draft stays here when the forward target is untracked.");
  // The safe fallback intentionally drops unknown forward entries. Confirmed
  // navigation still reaches the requested target without another document.
  await page.evaluate(() => window.history.back());
  await page.getByRole("dialog").getByRole("button", { name: "Tinggalkan halaman", exact: true }).click();
  await expect(page).toHaveURL(/entry=target/);
  await expect(note).toHaveValue("Draft stays here when the forward target is untracked.");
  expect(nativePrompts).toBe(0);
  expect(errors).toEqual([]);
});

test("V5 reverted decisions and notes do not block publication", async ({ page }, info) => {
  const errors = track(page);
  await installReviewMock(page);
  await page.addInitScript(() => {
    const state = (window as any).__solutionReviewMock;
    state.revision = "a".repeat(64);
    state.saved = { decision: "approved", items: ["triangle-area", "python-loop"].map((itemId, index) => ({ itemId, itemHash: state.hashes[index], correctness: "approved", reasoning: "approved", problemProvenance: "approved", solutionProvenance: "approved", release: "approved" })) };
  });
  await page.route("**/api/admin/bundles/product/visual-product", request => request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "solution-bundle", courseId: "course", checksum, status: "draft", createdAt: "2026-01-01T00:00:00Z" }, previews: [{ id: solutionCollectionFixture.id, productType: "solution_collection", title: solutionCollectionFixture.title, version: 1, status: "draft", traceability: { ideaIds: [], sourceIds: [] }, sections: [] }], draft: { products: [{ id: solutionCollectionFixture.id, productType: "solution_collection", title: solutionCollectionFixture.title, version: 1, collection: solutionCollectionFixture }] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: true, issues: [] } } }));
  await page.goto(`${route}?mode=workspace-product`);
  const publish = page.getByRole("button", { name: "Publikasikan", exact: true });
  const notes = page.getByLabel("Catatan", { exact: true });
  await expect(publish).toBeEnabled();
  await notes.fill("Temporary draft");
  await expect(publish).toBeDisabled();
  await notes.fill("");
  await expect(publish).toBeEnabled();
  await notes.fill("  \n ");
  await expect(publish).toBeEnabled();
  await page.getByLabel(criterionLabels[0], { exact: true }).click();
  await page.getByRole("option", { name: "Perlu revisi", exact: true }).click();
  await expect(publish).toBeDisabled();
  await capture(page, info, "v5-actual-decision-change-blocks-publish");
  await page.getByLabel(criterionLabels[0], { exact: true }).click();
  await page.getByRole("option", { name: "Disetujui", exact: true }).click();
  await expect(publish).toBeEnabled();
  await expect(page.getByText("Ada perubahan review yang belum disimpan. Simpan atau pulihkan review tersimpan sebelum publikasi.", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("zyx:solution-review:fixture-reviewer:visual-product"))).toBeNull();
  await capture(page, info, "v5-reverted-values-restore-publication");
  expect(errors).toEqual([]);
});

test("English V5 changed-item notes remain available until explicit discard", async ({ page }, info) => {
  const errors = track(page);
  await installReviewMock(page);
  await page.addInitScript(() => {
    (window as any).__solutionReviewMock.revision = "a".repeat(64);
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("Unavailable", "SecurityError"); } });
  });
  await page.route("**/api/admin/bundles/product/visual-product", async request => {
    const revision = await page.evaluate(() => (window as any).__solutionReviewMock.revision);
    const collection = structuredClone(solutionCollectionFixture);
    if (revision !== checksum) collection.items[0].prompt = [{ id: "updated-prompt", kind: "markdown", markdown: "A revised triangle problem requires a fresh decision." }];
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "solution-bundle", courseId: "course", checksum: revision, status: "draft", createdAt: "2026-01-01T00:00:00Z" }, previews: [{ id: collection.id, productType: "solution_collection", title: collection.title, version: 1, status: "draft", traceability: { ideaIds: [], sourceIds: [] }, sections: [] }], draft: { products: [{ id: collection.id, productType: "solution_collection", title: collection.title, version: 1, collection }] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] } } });
  });
  await page.goto(`${route}?mode=workspace-product&language=en`);
  await expect(page.getByLabel("Notes", { exact: true })).toBeEnabled();
  await page.getByLabel("Notes", { exact: true }).fill("Retain this rationale when the question changes.");
  await page.evaluate(() => { const state = (window as any).__solutionReviewMock; state.revision = "b".repeat(64); state.hashes[0] = "new-triangle"; });
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  const previous = page.getByLabel("Previous revision drafts", { exact: true });
  await expect(previous).toHaveValue(/Retain this rationale/);
  await expect(previous).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  await capture(page, info, "v5-previous-notes-english-readable");
  await page.getByRole("link", { name: "Back to reviews", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, info, "v5-previous-notes-english-leave-guard");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(previous).toHaveValue(/Retain this rationale/);
  await page.getByRole("button", { name: "Discard earlier drafts", exact: true }).click();
  await capture(page, info, "v5-previous-notes-english-discard-confirmation");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(previous).toHaveValue(/Retain this rationale/);
  await page.getByRole("button", { name: "Discard earlier drafts", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Discard earlier drafts", exact: true }).click();
  await expect(previous).toHaveCount(0);
  await expect(page.getByLabel("Notes", { exact: true })).toBeEnabled();
  await capture(page, info, "v5-previous-notes-english-explicitly-discarded");
  expect(errors).toEqual([]);
});

for (const order of ["refresh", "recover"] as const) test(`V5 discarding old-item drafts preserves an unchanged-item conflict through ${order}`, async ({ page }, info) => {
  const errors = track(page);
  await installReviewMock(page);
  await page.addInitScript(({ blockStorage }) => {
    const state = (window as any).__solutionReviewMock;
    state.revision = "a".repeat(64);
    state.saved = { decision: "approved", items: ["triangle-area", "python-loop"].map((itemId, index) => ({ itemId, itemHash: state.hashes[index], correctness: "approved", reasoning: "approved", problemProvenance: "approved", solutionProvenance: "approved", release: "approved" })) };
    if (blockStorage) Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("Unavailable", "SecurityError"); } });
  }, { blockStorage: order === "refresh" });
  await page.route("**/api/admin/bundles/product/visual-product", async request => {
    const revision = await page.evaluate(() => (window as any).__solutionReviewMock.revision);
    const collection = structuredClone(solutionCollectionFixture);
    if (revision !== checksum) collection.items[1].prompt = [{ id: "new-python-prompt", kind: "markdown", markdown: "Telusuri program yang sudah direvisi." }];
    await request.fulfill({ json: { bundle: { id: "visual-product", bundleId: "solution-bundle", courseId: "course", checksum: revision, status: "draft", createdAt: "2026-01-01T00:00:00Z" }, previews: [{ id: collection.id, productType: "solution_collection", title: collection.title, version: 1, status: "draft", traceability: { ideaIds: [], sourceIds: [] }, sections: [] }], draft: { products: [{ id: collection.id, productType: "solution_collection", title: collection.title, version: 1, collection }] }, dependencies: [], blockReviews: [], qualityEvaluation: { publicationReady: false, issues: [] } } });
  });
  await page.goto(`${route}?mode=workspace-product`);
  await expect(page.getByLabel("Catatan", { exact: true })).toBeEnabled();
  await page.getByLabel("Catatan", { exact: true }).fill("Catatan A tetap harus dipulihkan.");
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await page.getByLabel("Catatan", { exact: true }).fill("Catatan B boleh dibuang setelah soal berubah.");
  await page.evaluate(() => { const state = (window as any).__solutionReviewMock; state.revision = "b".repeat(64); state.hashes[1] = "changed-python"; state.saved = null; });
  await page.getByRole("button", { name: "Muat ulang status", exact: true }).click();
  await expect(page.getByText("Review di server berubah sejak draft lokal dibuat.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Draft revisi sebelumnya", { exact: true })).toHaveValue(/Catatan B boleh dibuang/);
  await page.getByRole("button", { name: "Buang draft lama", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Buang draft lama", exact: true }).click();
  await expect(page.getByLabel("Draft revisi sebelumnya", { exact: true })).toHaveCount(0);
  if (order === "refresh") await page.getByRole("button", { name: "Muat ulang status", exact: true }).click();
  else {
    const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("zyx:solution-review:fixture-reviewer:visual-product")!));
    expect(stored.items["triangle-area"].draft.notes).toBe("Catatan A tetap harus dipulihkan.");
    expect(stored.previousItems).toEqual({});
  }
  await expect(page.getByText("Review di server berubah sejak draft lokal dibuat.", { exact: false })).toBeVisible();
  await capture(page, info, `v5-prior-discard-preserves-conflict-${order}`);
  await page.getByRole("button", { name: "Pulihkan draft lokal", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Pulihkan draft lokal", exact: true }).click();
  await expect(page.getByLabel("Draft revisi sebelumnya", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Sebelumnya", exact: true }).click();
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("Catatan A tetap harus dipulihkan.");
  await expect(page.getByLabel("Draft revisi sebelumnya", { exact: true })).toHaveCount(0);
  await capture(page, info, `v5-conflicting-notes-recovered-without-discarded-archive-${order}`);
  expect(errors).toEqual([]);
});
