import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import { eq, sql } from "drizzle-orm";
import { workerTarget, assertWorkerEnvironment } from "./worker-targets.mjs";
import { computeProductBundleChecksum, deterministicProductSerialization, validateProductBundle, type ProductEntity } from "../../lib/bundle/product-validator";
import { buildProductBundleKey, joinKey, slugifySegment } from "../../lib/storage/keys";
import { LIMIT_ARTICLE_FIXTURE } from "../../tests/fixtures/product-learning/limit-epsilon-delta";
import { readRemainingRun } from "./smoke-remaining-workers";

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export function productPdfSmokeTarget(args: string[]) {
  const target = workerTarget(args[0]);
  assert.equal(target.name, "production", "PRODUCT_PDF_SMOKE_PRODUCTION_REQUIRED");
  assert.equal(args.length, 1, "PRODUCT_PDF_SMOKE_ARGUMENTS_INVALID");
  return target;
}

// Reuse the complete learning fixture; only the ProductEntity transport mapping is local.
export function buildProductPdfSmokeFixture(id: string) {
  const document = structuredClone(LIMIT_ARTICLE_FIXTURE);
  const referenceIds = new Set(document.sections.flatMap(section => [section.id, ...section.blocks.map(block => block.id)]));
  const ownedPedagogy = (value: unknown) => value === undefined ? undefined : JSON.parse(JSON.stringify(value,
    (_key, nested) => typeof nested === "string" && referenceIds.has(nested) ? `${id}-${nested}` : nested));
  const hash = digest(id);
  const sourceRefs = [{ sourceId: `${id}-source`, version: 1, checksum: hash, excerptIds: [`${id}-excerpt`] }];
  const article: Extract<ProductEntity, { productType: "article" }> = {
    id: `${id}-article`, productType: "article", slug: `${id}-article`, title: "Limit fungsi linear", courseId: id, chapterId: id,
    version: 1, status: "draft", ideaLinks: [{ id: `${id}-idea`, version: 1, semanticHash: hash, weight: 1, role: "primary" }],
    sourceRefs, schemaVersion: "1.0", sourceHash: hash, generationHash: hash, creatorId: id, blocks: [],
    sections: document.sections.map(section => ({
      id: `${id}-${section.id}`, kind: section.kind, learningSectionId: section.kind === "topic" ? `${id}-learning` : undefined,
      parentSectionId: section.parentSectionId ? `${id}-${section.parentSectionId}` : undefined,
      title: section.title, slug: section.slug, orderIndex: section.orderIndex, learningObjective: section.learningObjective,
      ideaIds: [`${id}-idea`], sourceRefs, pedagogy: ownedPedagogy(section.pedagogy),
      blocks: section.blocks.map(block => ({ id: `${id}-${block.id}`, blockType: block.blockType, title: block.title,
        orderIndex: block.orderIndex, contentMarkdown: block.content, ideaIds: [`${id}-idea`], sourceRefs,
        workedExamplePayload: block.workedExamplePayload, formativeCheckPayload: block.formativeCheckPayload })),
    })), visuals: document.visuals,
  };
  const contentMarkdown = [
    "# Limit fungsi linear\n\nBukti mandiri PDF produksi. Catatan ini membahas limit fungsi linear menggunakan definisi epsilon dan delta.",
    "## Definisi\n\nNilai fungsi f(x)=2x+1 mendekati 7 ketika x mendekati 3. Untuk setiap toleransi positif epsilon, pilih delta positif sehingga jarak nilai fungsi terhadap 7 lebih kecil daripada epsilon.",
    "## Rumus utama\n\n$$|f(x)-7|=|2x+1-7|=2|x-3|$$\n\nGunakan $$\\delta=\\varepsilon/2$$ untuk menjamin galat keluaran lebih kecil daripada toleransi yang diminta. Toleransi epsilon dan delta harus positif.",
    "## Contoh perhitungan\n\nJika epsilon sebesar 0,2, pilih delta sebesar 0,1. Ambil x=3,05. Jarak x terhadap 3 adalah 0,05, sedangkan jarak f(x)=7,1 terhadap 7 adalah 0,1. Kedua jarak memenuhi batas yang ditentukan.",
    "## Pemeriksaan\n\nPilihan delta bergantung pada epsilon. Ketika toleransi keluaran diperkecil, toleransi masukan juga diperkecil. Pemeriksaan dilakukan menggunakan nilai mutlak sehingga pendekatan dari kiri dan kanan mengikuti syarat yang sama.",
    "## Latihan mandiri\n\nTentukan delta untuk epsilon sebesar 0,04. Periksa hasil dengan memilih satu nilai x di kiri 3 dan satu nilai di kanan 3. Jawaban: delta sebesar 0,02 memenuhi syarat karena galat keluaran sama dengan dua kali galat masukan.",
  ].join("\n\n");
  const diktat: Extract<ProductEntity, { productType: "diktat" }> = {
    id: `${id}-diktat`, productType: "diktat", title: "Limit fungsi linear", courseId: id, chapterId: id, version: 1, status: "draft",
    ideaLinks: structuredClone(article.ideaLinks), sourceRefs, schemaVersion: "1.0", sourceHash: hash,
    generationHash: digest(contentMarkdown), creatorId: id, contentMarkdown, sourceArticleId: article.id,
    sourceArticleVersion: article.version, sourceArticleHash: article.generationHash,
  };
  const products = [article, diktat];
  const dependencies = [{ id: `${id}-lineage`, upstreamEntityType: "product" as const, upstreamEntityId: article.id,
    upstreamVersion: article.version, upstreamHash: article.generationHash, downstreamEntityType: "diktat" as const,
    downstreamEntityId: diktat.id, downstreamVersion: diktat.version, downstreamHash: diktat.generationHash, freshness: "UP_TO_DATE" as const }];
  const files = new Map([ ["entities/products.json", strToU8(deterministicProductSerialization(products))],
    ["entities/dependencies.json", strToU8(deterministicProductSerialization(dependencies))] ]);
  const manifestBase = { bundleId: id, bundleType: "product" as const, schemaVersion: "product-bundle.v3" as const, courseId: id,
    entityFiles: [{ path: "entities/products.json", entityType: "products" as const, checksum: digest(files.get("entities/products.json")!), stableIds: products.map(product => product.id) },
      { path: "entities/dependencies.json", entityType: "dependencies" as const, checksum: digest(files.get("entities/dependencies.json")!), stableIds: dependencies.map(dependency => dependency.id) }],
    creatorId: id, createdAt: new Date().toISOString(), conflicts: [] };
  const checksum = computeProductBundleChecksum(manifestBase, files);
  files.set("manifest.json", strToU8(deterministicProductSerialization({ ...manifestBase, bundleChecksum: checksum })));
  const bytes = zipSync(Object.fromEntries(files));
  const validation = validateProductBundle(bytes);
  assert.ok(validation.success, `PRODUCT_PDF_SMOKE_FIXTURE_INVALID:${validation.success ? "" : validation.issues.map(issue => issue.code).join(",")}`);
  return { bytes, bundle: validation.data, article, diktat };
}

export function assertProductPdfInspection(bytes: Uint8Array, inspected: { pageCount: number; text: string }, expectedPages: number) {
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-", "PRODUCT_PDF_SMOKE_INVALID_BYTES");
  assert.ok(bytes.length > 1000, "PRODUCT_PDF_SMOKE_EMPTY_BYTES");
  assert.ok(inspected.pageCount >= 1 && inspected.pageCount <= 4, "PRODUCT_PDF_SMOKE_PAGE_BUDGET");
  assert.equal(inspected.pageCount, expectedPages, "PRODUCT_PDF_SMOKE_PAGE_MISMATCH");
  assert.match(inspected.text, /Bukti mandiri PDF produksi/, "PRODUCT_PDF_SMOKE_CONTENT_MISSING");
  assert.match(inspected.text, /Contoh perhitungan/, "PRODUCT_PDF_SMOKE_EXAMPLE_MISSING");
  assert.match(inspected.text, /zyxacademy\.com/, "PRODUCT_PDF_SMOKE_FOOTER_MISSING");
  assert.doesNotMatch(inspected.text, /\[object Object\]|\\undefined|\uFFFD/, "PRODUCT_PDF_SMOKE_CORRUPT_TEXT");
}

async function main() {
  const target = productPdfSmokeTarget(process.argv.slice(2));
  const config = JSON.parse(await readFile(`${target.output}/.env.${target.name}.json`, "utf8"));
  assertWorkerEnvironment(target, config);
  assert.equal(config.INNGEST_SERVE_ORIGIN, target.origin);
  Object.assign(process.env, config);
  const [{ db, pool }, s, { storage }] = await Promise.all([import("../../lib/db"), import("../../db/schema"), import("../../lib/storage")]);
  const id = `neon-product-pdf-${randomUUID()}`;
  const fixture = buildProductPdfSmokeFixture(id);
  const sourceKey = buildProductBundleKey({ runId: id, bundleId: id, checksum: fixture.bundle.checksum });
  const evidence: Record<string, unknown> = { fixtureId: id, accepted: false, cleanupComplete: false };
  let fixturesCreated = false, importId: string | undefined, pdfKey: string | undefined, stage = "preflight";
  const headers = { Authorization: `Bearer ${config.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": config.INNGEST_ENV, "Content-Type": "application/json" };
  const save = () => writeFile(`${target.output}/product-pdf-smoke.json`, JSON.stringify({ ...evidence, stage, importId, ownedObjects: [sourceKey, pdfKey].filter(Boolean) }, null, 2));
  async function api(path: string, init: RequestInit = {}, allowMissing = false) {
    const response = await fetch(`https://api.inngest.com/v2${path}`, { ...init, headers, signal: AbortSignal.timeout(30_000) });
    if (allowMissing && response.status === 404) return undefined;
    assert.ok(response.ok, `PRODUCT_PDF_SMOKE_INNGEST_HTTP_${response.status}`);
    return response.json();
  }
  try {
    const database = await db.execute(sql`select current_database() as name`);
    assert.equal(database.rows[0].name, "neondb");
    const environments = await api("/envs?limit=250");
    assert.equal(environments.data?.length, 1);
    assert.equal(environments.data[0].id, target.inngestEnvironment);
    const eventKeys = await api("/keys/events?limit=100");
    assert.ok(eventKeys.data?.some((key: { key: string }) => key.key === config.INNGEST_EVENT_KEY), "Inngest event key target mismatch");
    const health = await fetch(`${target.origin}/health`, { signal: AbortSignal.timeout(30_000) });
    assert.equal(health.status, 200);
    const worker = await health.json();
    assert.equal(worker.functions, 22);
    assert.match(config.ZYX_COMPUTE_REVISION, /^[a-f0-9]{64}$/);
    assert.equal(worker.version, config.ZYX_COMPUTE_REVISION);
    evidence.workerRevision = worker.version;
    assert.ok(storage.download, "PRODUCT_PDF_SMOKE_DOWNLOAD_UNAVAILABLE");
    stage = "create-owned-fixtures";
    await save();
    await db.transaction(async tx => {
      await tx.insert(s.user).values({ id, name: "Neon product PDF fixture", email: `${id}@example.invalid`, role: "admin" });
      await tx.insert(s.pengguna).values({ id, status: "active" });
      await tx.insert(s.courses).values({ id, title: "Neon product PDF fixture", category: "Matematika" });
      await tx.insert(s.chapters).values({ id, courseId: id, title: "Limit", orderIndex: 1 });
    });
    fixturesCreated = true;
    stage = "stage-owned-draft";
    await save();
    const { stageProductBundle } = await import("../../lib/bundle/product-staging");
    const staged = await stageProductBundle({ runId: id, bundleId: id, courseId: id, requestedBy: id,
      bytes: fixture.bytes, checksum: fixture.bundle.checksum, bundle: fixture.bundle });
    importId = staged.importId;
    assert.equal(staged.created, true);
    assert.equal(staged.status, "draft");
    assert.equal(staged.sourceKey, sourceKey);
    assert.equal(digest(await storage.download(sourceKey)), digest(fixture.bytes), "PRODUCT_PDF_SMOKE_STAGED_BYTES_MISMATCH");
    pdfKey = joinKey("overhaul", importId, "diktat-pdf", `${slugifySegment(fixture.diktat.id)}-${fixture.diktat.generationHash.slice(0, 16)}.pdf`);
    stage = "invoke-product-pdf-worker";
    await save();
    const invoked = await api("/apps/zyx-academy/functions/product-diktat-pdf-worker/invoke", {
      method: "POST", body: JSON.stringify({ data: { importId, requestedBy: id }, idempotencyKey: `${id}-render` }),
    });
    assert.equal(typeof invoked.data?.runId, "string", "PRODUCT_PDF_SMOKE_RUN_MISSING");
    evidence.runId = invoked.data.runId;
    await save();
    let completed = false;
    for (let attempt = 0; attempt < 220; attempt++) {
      const run = await readRemainingRun(path => api(path, {}, true), "product-diktat-pdf-worker", invoked.data.runId);
      if (!run) { await new Promise(resolve => setTimeout(resolve, 3000)); continue; }
      assert.equal(run?.function?.id, "product-diktat-pdf-worker", "PRODUCT_PDF_SMOKE_FUNCTION_MISMATCH");
      evidence.runStatus = String(run.status).toUpperCase();
      if (["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"].includes(String(evidence.runStatus))) {
        await save();
        assert.equal(evidence.runStatus, "COMPLETED", "PRODUCT_PDF_SMOKE_RUN_FAILED");
        const output = (typeof run.output === "string" ? JSON.parse(run.output) : run.output) as { status?: string } | undefined;
        assert.equal(output?.status, "ready", "PRODUCT_PDF_SMOKE_OUTPUT_NOT_READY");
        completed = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    assert.equal(completed, true, "PRODUCT_PDF_SMOKE_RUN_PENDING");
    stage = "inspect-persisted-pdf";
    const rows = await db.select().from(s.buktiPdfBundle).where(eq(s.buktiPdfBundle.imporBundleId, importId));
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.status, "ready");
    assert.equal(row.failureCode, null);
    assert.equal(row.productId, fixture.diktat.id);
    assert.equal(row.articleHash, fixture.article.generationHash);
    assert.equal(row.diktatHash, fixture.diktat.generationHash);
    assert.equal(row.storageKey, pdfKey);
    const { PRODUCT_DIKTAT_PRINT_PROFILE, PRODUCT_DIKTAT_RENDERER_VERSION } = await import("../../lib/bundle/product-diktat-pdf");
    assert.equal(row.printProfile, PRODUCT_DIKTAT_PRINT_PROFILE);
    assert.equal(row.rendererVersion, PRODUCT_DIKTAT_RENDERER_VERSION);
    const bytes = await storage.download(pdfKey);
    const { PDFParse } = await import("pdf-parse");
    const { setupPdfWorker } = await import("../../lib/compute/pdf-worker");
    await setupPdfWorker(PDFParse);
    const parser = new PDFParse({ data: bytes.slice() });
    let inspected;
    try { inspected = { pageCount: (await parser.getInfo()).total, text: (await parser.getText()).text }; }
    finally { await parser.destroy(); }
    assertProductPdfInspection(bytes, inspected, row.pageCount!);
    const pdfSha256 = digest(bytes);
    assert.equal(digest(await storage.download(pdfKey)), pdfSha256, "PRODUCT_PDF_SMOKE_READBACK_HASH_MISMATCH");
    const [draft] = await db.select().from(s.imporBundle).where(eq(s.imporBundle.id, importId));
    assert.equal(draft.status, "draft");
    assert.equal(draft.requestedBy, id);
    evidence.pdf = { evidenceId: row.id, sha256: pdfSha256, size: bytes.length, pageCount: inspected.pageCount, textVerified: true,
      printProfile: row.printProfile, rendererVersion: row.rendererVersion, importRemainedDraft: true };
    evidence.accepted = true;
    stage = "cleanup-exact-owned-outputs";
    await save();
    for (const key of [pdfKey, sourceKey]) {
      await storage.delete(key);
      assert.equal(await storage.exists(key), false, "PRODUCT_PDF_SMOKE_OBJECT_DELETE_PENDING");
    }
    await db.transaction(async tx => {
      await tx.delete(s.buktiPdfBundle).where(eq(s.buktiPdfBundle.imporBundleId, importId!));
      await tx.delete(s.itemImporBundle).where(eq(s.itemImporBundle.imporBundleId, importId!));
      await tx.delete(s.auditMutasi).where(eq(s.auditMutasi.actorId, id));
      await tx.delete(s.imporBundle).where(eq(s.imporBundle.id, importId!));
      await tx.delete(s.chapters).where(eq(s.chapters.id, id));
      await tx.delete(s.courses).where(eq(s.courses.id, id));
      await tx.delete(s.pengguna).where(eq(s.pengguna.id, id));
      await tx.delete(s.user).where(eq(s.user.id, id));
    });
    evidence.cleanupComplete = true;
    stage = "complete";
    await save();
    console.log(JSON.stringify({ fixtureId: id, accepted: true, cleanupComplete: true, runId: evidence.runId }));
  } finally {
    try {
      if (fixturesCreated && !evidence.cleanupComplete) {
        await save();
        await writeFile(`${target.output}/product-pdf-retained.json`, JSON.stringify({ fixtureId: id, stage, importId,
          ownedObjects: [sourceKey, pdfKey].filter(Boolean), runId: evidence.runId, reason: "Incomplete acceptance or cleanup; retain owned draft and outputs for diagnosis" }, null, 2));
        console.log(JSON.stringify({ fixtureId: id, cleanup: "retained", stage }));
      }
    } finally { await pool.end(); }
  }
}

if (import.meta.main) await main();
