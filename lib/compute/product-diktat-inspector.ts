import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { inspectPdfText } from "./pdf-inspection";
import { db } from "@/db";
import { auditMutasi, buktiPdfBundle, imporBundle } from "@/db/schema";
import { storage, type StorageProvider } from "@/lib/storage";
import { joinKey, slugifySegment } from "@/lib/storage/keys";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import { claimProductReviewSnapshot } from "@/lib/bundle/product-review-snapshot";
import { claimQueuedLegacyPdfAttempt, LEGACY_PDF_ATTEMPT_TIMEOUT_MINUTES } from "@/lib/bundle/product-diktat-queue";
import { minutesAgo } from "@/lib/date-utils";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { readProductBundleForDiktat } from "@/lib/bundle/product-staged-worker";
import type { SafeFailureCode } from "@/lib/materials/pdf-artifact-contract";
import { uploadProductDiktatPdf } from "./product-diktat-storage";
import {
  PRODUCT_DIKTAT_PRINT_PROFILE,
  PRODUCT_DIKTAT_RENDERER_VERSION,
  compileProductArticleHtml,
  compileProductDiktatHtml,
  renderProductDiktatPdf,
} from "@/lib/bundle/product-diktat-pdf";

export interface InspectedPdf {
  pageCount: number;
  text: string;
}

type ArticleProduct = Extract<ProductEntity, { productType: "article" }>;
type DiktatProduct = Extract<ProductEntity, { productType: "diktat" }>;

export async function inspectProductDiktatPdf(bytes: Uint8Array): Promise<InspectedPdf> {
  try {
    const { pageCount, text } = await inspectPdfText(bytes);
    if (!text.trim() || text.includes("[object Object]") || text.includes("\\undefined") || text.includes("\uFFFD")) {
      throw new Error("PRODUCT_DIKTAT_PDF_CONTENT_INVALID");
    }
    return { pageCount, text };
  } catch (error) {
    throw new Error("PRODUCT_DIKTAT_PDF_CONTENT_INSPECTION_FAILED", { cause: error });
  }
}

type ImportSnapshot = typeof imporBundle.$inferSelect;
type StagingAudit = { id: string; action: string; correlationId: string | null; afterSnapshot: Record<string, unknown> | null };
type ExactLegacyDraft = { runId: string; expectedChecksum: string; diktatId?: string; articleId?: string };

export function assertLegacyDiktatDraft(row: Pick<ImportSnapshot, "bundleType" | "version" | "status" | "checksum"> | undefined, exact?: ExactLegacyDraft, staging?: StagingAudit) {
  if (!row || row.bundleType !== "product" || ![2, 3].includes(row.version) || row.status !== "draft") throw new Error("PRODUCT_DIKTAT_RENDER_DRAFT_REQUIRED");
  if (exact && (row.checksum !== exact.expectedChecksum || !staging || !["draft_created", "draft_replaced"].includes(staging.action) || staging.correlationId !== exact.runId || staging.afterSnapshot?.checksum !== exact.expectedChecksum)) throw new Error("PRODUCT_DIKTAT_EXACT_DRAFT_REQUIRED");
}

export function assertLegacyLearningProducts(bundle: { manifest: { schemaVersion: string }; products: readonly { productType: string; schemaVersion: string; units?: unknown }[] }, version: number) {
  if (bundle.manifest.schemaVersion !== `product-bundle.v${version}` || !bundle.products.every(product => ["article", "diktat", "flashcard_set", "flashcard"].includes(product.productType) && !/\.v[45]$/.test(product.schemaVersion) && !(product.productType === "diktat" && product.units !== undefined)) || !bundle.products.some(product => product.productType === "article")) throw new Error("PRODUCT_DIKTAT_LEGACY_LEARNING_ONLY_REQUIRED");
}

/** Each linked Diktat and each Article without a Diktat is a separate gate target. */
export function selectLegacyPdfTarget(products: readonly ProductEntity[], exact: ExactLegacyDraft): { article: ArticleProduct; diktat?: DiktatProduct } {
  const invalidId = (id: unknown) => id !== undefined && (typeof id !== "string" || !id.trim() || id.length > 256 || id.includes("\0"));
  if (invalidId(exact.articleId) || invalidId(exact.diktatId) || (exact.articleId !== undefined && exact.diktatId !== undefined)) throw new Error("PRODUCT_DIKTAT_EXACT_PRODUCT_REQUIRED");
  const articles = products.filter((product): product is ArticleProduct => product.productType === "article");
  const diktats = products.filter((product): product is DiktatProduct => product.productType === "diktat");
  const targets = [
    ...diktats.map(diktat => ({ article: articles.find(article => article.id === diktat.sourceArticleId), diktat })),
    ...articles.filter(article => !diktats.some(diktat => diktat.sourceArticleId === article.id)).map(article => ({ article, diktat: undefined })),
  ];
  if (!exact.articleId && !exact.diktatId && targets.length !== 1) throw new Error("PRODUCT_DIKTAT_EXACT_PRODUCT_REQUIRED");
  const target = exact.articleId ? targets.find(item => !item.diktat && item.article?.id === exact.articleId)
    : exact.diktatId ? targets.find(item => item.diktat?.id === exact.diktatId) : targets[0];
  if (!target?.article) throw new Error("PRODUCT_DIKTAT_SOURCE_MISSING");
  return { article: target.article, diktat: target.diktat };
}

async function latestStagingAudit(connection: Pick<typeof db, "select">, importId: string) {
  const [audit] = await connection.select({ id: auditMutasi.id, action: auditMutasi.action, correlationId: auditMutasi.correlationId, afterSnapshot: auditMutasi.afterSnapshot }).from(auditMutasi).where(and(eq(auditMutasi.entityType, "product_bundle"), eq(auditMutasi.entityId, importId), inArray(auditMutasi.action, ["draft_created", "draft_replaced"]))).orderBy(desc(auditMutasi.createdAt), desc(auditMutasi.id)).limit(1);
  return audit;
}

/** Lock and compare the original import before every evidence mutation. */
async function claimEvidenceSnapshot(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], snapshot: ImportSnapshot, exact?: ExactLegacyDraft, auditId?: string, actorId?: string) {
  await assertAuthoringActor(tx, actorId ?? "", { roles: ["admin"], error: "PRODUCT_DIKTAT_RENDER_FORBIDDEN", lock: true, requireLegacyAdmin: true });
  try { await claimProductReviewSnapshot(tx, snapshot, new Date()); }
  catch { throw new Error("PRODUCT_DIKTAT_SNAPSHOT_CONFLICT"); }
  const [current] = await tx.select().from(imporBundle).where(eq(imporBundle.id, snapshot.id)).limit(1);
  if (!current || current.version !== snapshot.version || current.bundleType !== snapshot.bundleType || current.bundleId !== snapshot.bundleId || current.courseId !== snapshot.courseId) throw new Error("PRODUCT_DIKTAT_SNAPSHOT_CONFLICT");
  if (exact) {
    const staging = await latestStagingAudit(tx, snapshot.id);
    if (staging?.id !== auditId) throw new Error("PRODUCT_DIKTAT_SNAPSHOT_CONFLICT");
    assertLegacyDiktatDraft(current, exact, staging);
  }
}

export function productDiktatFailureCode(error: unknown): SafeFailureCode {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("FORMULA")) return "FORMULA_RENDER_ERROR";
  if (message.includes("MATH_RENDER")) return "FORMULA_RENDER_ERROR";
  if (message.includes("FONT")) return "FONT_MISSING";
  if (message.includes("OVERFLOW") || message.includes("UNIT_TOO_TALL")) return "LAYOUT_OVERFLOW";
  if (message.includes("TIMEOUT") || (error instanceof Error && error.name === "TimeoutError")) return "RENDER_TIMEOUT";
  if (message.includes("RENDERER_CONFIG_MISSING")) return "RENDERER_CONFIG_MISSING";
  if (message.includes("RENDERER_REJECTED")) return "RENDERER_REJECTED";
  if (message.includes("RENDERER_INVALID_PDF")) return "INVALID_PDF_OUTPUT";
  if (message.includes("PDF_INSPECTION_FAILED")) {
    const cause = error instanceof Error ? error.cause : undefined;
    return cause instanceof Error && cause.message === "PRODUCT_DIKTAT_PDF_CONTENT_INSPECTION_FAILED"
      ? "INVALID_PDF_OUTPUT"
      : "RENDER_UNAVAILABLE";
  }
  if (message.includes("RENDERER")) return "RENDER_UNAVAILABLE";
  if (message.includes("PAGE")) return "PAGE_BUDGET_EXCEEDED";
  if (message.includes("STORAGE")) return "STORAGE_UNAVAILABLE";
  return "INVALID_SOURCE_MARKDOWN";
}


/** Renders and stores PDF evidence, marking only transient failures as retryable. */
export async function generateProductDiktatPdfEvidence(input: {
  importId: string;
  requestedBy: string;
  productId?: string;
  expectedRevision?: string;
  /** Required for queued requests; the private local operator creates its own attempt. */
  attemptId?: string;
  renderer?: (html: string) => Promise<Uint8Array>;
  storageProvider?: StorageProvider;
  throwOnFailure?: boolean;
  /** Only the private operator supplies this scope; never trust it as a V4 receipt. */
  exactLegacyDraft?: ExactLegacyDraft;
  verifyReadback?: boolean;
  beforeEvidenceWrite?: () => void;
}): Promise<{ evidenceId: string; productId: string; status: "ready" | "failed"; pageCount?: number; failureCode?: SafeFailureCode; storageKey?: string; checksum?: string; stagingAuditId?: string; articleVersion?: number; articleHash?: string; diktatHash?: string }> {
  await assertAuthoringActor(db, input.requestedBy, { roles: ["admin"], error: "PRODUCT_DIKTAT_RENDER_FORBIDDEN", requireLegacyAdmin: true });
  const [importRow] = await db.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1);
  if (!importRow) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  const staging = input.exactLegacyDraft ? await latestStagingAudit(db, input.importId) : undefined;
  assertLegacyDiktatDraft(importRow, input.exactLegacyDraft, staging);
  if (!input.exactLegacyDraft && (!input.productId || !input.attemptId || !/^[a-f0-9]{64}$/.test(input.expectedRevision ?? "") || input.expectedRevision !== importRow.checksum)) throw new Error("PRODUCT_DIKTAT_SNAPSHOT_CONFLICT");

  const bundle = await readProductBundleForDiktat(input.importId);
  if (bundle.manifest.bundleChecksum !== importRow.checksum) throw new Error("PRODUCT_DIKTAT_SNAPSHOT_CONFLICT");
  if (input.exactLegacyDraft) assertLegacyLearningProducts(bundle, importRow.version);
  const target = input.exactLegacyDraft
    ? selectLegacyPdfTarget(bundle.products, input.exactLegacyDraft)
    : selectLegacyPdfTarget(bundle.products, { runId: "", expectedChecksum: "", diktatId: input.productId });
  const { article, diktat } = target;
  // Article-owned exports are private-operator only and always read back bytes.
  if (!diktat && (!input.exactLegacyDraft || !input.renderer || !input.verifyReadback)) throw new Error("PRODUCT_DIKTAT_LOCAL_RENDERER_REQUIRED");
  const productId = diktat?.id ?? article.id;
  // The non-null legacy column is the Article's self-lineage for this target;
  // it is not a Diktat hash and does not imply a Diktat entity exists.
  const lineageHash = diktat?.generationHash ?? article.generationHash;
  const staticFigureAssets = article.schemaVersion === "article.v4" ? await (await import("./product-diktat-worker-assets")).loadDiktatWorkerAssets(bundle) : undefined;

  // The attempt ID also prevents an earlier concurrent render from completing a newer attempt.
  const id = input.exactLegacyDraft ? `pdf-evidence-${randomUUID()}` : input.attemptId!;
  const now = new Date();
  const base = {
    id,
    imporBundleId: input.importId,
    productId,
    articleVersion: article.version,
    articleHash: article.generationHash,
    diktatHash: lineageHash,
    rendererVersion: PRODUCT_DIKTAT_RENDERER_VERSION,
    printProfile: PRODUCT_DIKTAT_PRINT_PROFILE,
  };
  const queuedBinding = { attemptId: id, importId: input.importId, requestedBy: input.requestedBy, productId, expectedRevision: input.expectedRevision ?? "", articleVersion: article.version, articleHash: article.generationHash, diktatHash: lineageHash, sourceUriOrKey: importRow.sourceUriOrKey, bundleId: importRow.bundleId, courseId: importRow.courseId, version: importRow.version };
  input.beforeEvidenceWrite?.();
  const previous = await db.transaction(async tx => {
    await claimEvidenceSnapshot(tx, importRow, input.exactLegacyDraft, staging?.id, input.requestedBy);
    if (!input.exactLegacyDraft) return claimQueuedLegacyPdfAttempt(tx, queuedBinding);
    await tx.insert(buktiPdfBundle).values({ ...base, status: "pending", createdAt: now, updatedAt: now }).onConflictDoUpdate({
      target: [buktiPdfBundle.imporBundleId, buktiPdfBundle.productId, buktiPdfBundle.diktatHash, buktiPdfBundle.printProfile],
      set: { ...base, status: "pending", storageKey: null, pageCount: null, failureCode: null, updatedAt: now },
    });
    return null;
  });
  if (previous?.status === "ready") return { evidenceId: id, productId, status: "ready", pageCount: previous.pageCount ?? undefined };
  if (previous?.status === "failed") return { evidenceId: id, productId, status: "failed", failureCode: previous.failureCode as SafeFailureCode };

  let uploadedKey: string | undefined;
  let readyCommitStarted = false;
  const provider = input.storageProvider ?? storage;
  try {
    const html = diktat ? compileProductDiktatHtml({ article, diktat, staticFigureAssets }) : compileProductArticleHtml(article);
    const bytes = await (input.renderer ?? renderProductDiktatPdf)(html);
    const inspection = await inspectProductDiktatPdf(bytes).catch((error) => {
      console.error("Product Diktat PDF inspection failed:", error instanceof Error ? error.message : String(error));
      throw new Error("PRODUCT_DIKTAT_PDF_INSPECTION_FAILED", { cause: error });
    });
    if (inspection.pageCount < 1 || inspection.pageCount > 4) throw new Error("PRODUCT_DIKTAT_PAGE_BUDGET_EXCEEDED");
    const objectKey = joinKey("overhaul", input.importId, "diktat-pdf", `${slugifySegment(productId)}-${lineageHash.slice(0, 16)}-${randomUUID()}.pdf`);
    uploadedKey = objectKey;
    await uploadProductDiktatPdf({
      provider,
      bytes,
      filename: `${slugifySegment(diktat?.title ?? article.title)}.pdf`,
      key: objectKey,
      metadata: { importId: input.importId, productId, rendererVersion: PRODUCT_DIKTAT_RENDERER_VERSION },
    });
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (input.verifyReadback) {
      if (!provider.download) throw new Error("PRODUCT_DIKTAT_STORAGE_UNAVAILABLE");
      const readback = await provider.download(objectKey);
      if (readback.byteLength !== bytes.byteLength || createHash("sha256").update(readback).digest("hex") !== checksum) throw new Error("PRODUCT_DIKTAT_STORAGE_READBACK_MISMATCH");
    }
    input.beforeEvidenceWrite?.();
    readyCommitStarted = true;
    await db.transaction(async tx => {
      await claimEvidenceSnapshot(tx, importRow, input.exactLegacyDraft, staging?.id, input.requestedBy);
      if (!input.exactLegacyDraft) await claimQueuedLegacyPdfAttempt(tx, queuedBinding);
      const rows = await tx.update(buktiPdfBundle).set({ status: "ready", storageKey: objectKey, pageCount: inspection.pageCount, failureCode: null, updatedAt: new Date() }).where(and(eq(buktiPdfBundle.id, id), eq(buktiPdfBundle.status, "pending"), input.exactLegacyDraft ? undefined : gt(buktiPdfBundle.createdAt, minutesAgo(LEGACY_PDF_ATTEMPT_TIMEOUT_MINUTES)))).returning({ id: buktiPdfBundle.id });
      if (rows.length !== 1) throw new Error("PRODUCT_DIKTAT_SNAPSHOT_CONFLICT");
    });
    uploadedKey = undefined;
    return { evidenceId: id, productId, status: "ready", pageCount: inspection.pageCount, ...(input.verifyReadback ? { storageKey: objectKey, checksum } : {}), ...(staging ? { stagingAuditId: staging.id, articleVersion: article.version, articleHash: article.generationHash, diktatHash: lineageHash } : {}) };
  } catch (error) {
    // A lost commit response can hide a committed ready row. Never delete its bytes
    // unless it had not started or an explicit authorization/CAS denial rolled it back.
    if (uploadedKey && (!readyCommitStarted || (error instanceof Error && ["PRODUCT_DIKTAT_SNAPSHOT_CONFLICT", "PRODUCT_DIKTAT_RENDER_FORBIDDEN"].includes(error.message)))) await provider.delete(uploadedKey).catch(() => {});
    if (error instanceof Error && ["PRODUCT_DIKTAT_SNAPSHOT_CONFLICT", "PRODUCT_DIKTAT_RENDER_FORBIDDEN"].includes(error.message)) throw error;
    const failureCode = productDiktatFailureCode(error);
    input.beforeEvidenceWrite?.();
    await db.transaction(async tx => {
      await claimEvidenceSnapshot(tx, importRow, input.exactLegacyDraft, staging?.id, input.requestedBy);
      if (!input.exactLegacyDraft) await claimQueuedLegacyPdfAttempt(tx, queuedBinding);
      // Transient worker retries retain the original pending attempt and deadline.
      // If retries are exhausted, the status reader exposes its timeout for recovery.
      if (!input.exactLegacyDraft && input.throwOnFailure && ["RENDER_UNAVAILABLE", "RENDER_TIMEOUT", "STORAGE_UNAVAILABLE"].includes(failureCode)) return;
      const rows = await tx.update(buktiPdfBundle).set({ status: "failed", storageKey: null, pageCount: null, failureCode, updatedAt: new Date() }).where(and(eq(buktiPdfBundle.id, id), eq(buktiPdfBundle.status, "pending"), input.exactLegacyDraft ? undefined : gt(buktiPdfBundle.createdAt, minutesAgo(LEGACY_PDF_ATTEMPT_TIMEOUT_MINUTES)))).returning({ id: buktiPdfBundle.id });
      if (rows.length !== 1) throw new Error("PRODUCT_DIKTAT_SNAPSHOT_CONFLICT");
    });
    if (input.throwOnFailure && ["RENDER_UNAVAILABLE", "RENDER_TIMEOUT", "STORAGE_UNAVAILABLE"].includes(failureCode)) {
      throw new Error(`PRODUCT_DIKTAT_RENDER_RETRYABLE:${failureCode}`, { cause: error });
    }
    return { evidenceId: id, productId, status: "failed", failureCode };
  }
}
