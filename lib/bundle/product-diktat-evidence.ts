import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { buktiPdfBundle, diktatMateri, imporBundle, itemImporBundle, mataKuliah, publikasiBundle } from "@/db/schema";
import type { PdfArtifactEvidence } from "@/lib/materials/pdf-artifact-contract";
import { getProductBundleImport, parseStagedProductBundle } from "./product-staging";
import { resolveProductV4PdfBinding, selectProductPdfEvidence, type ProductV4PdfBinding } from "./product-pdf-selection";
import { productVersionId } from "./product-identity";
import { productEntityHash } from "./product-bundle-v2";
import { authenticProductV4VerificationReceipt, productV4VerificationRequirementId, type ProductV4VerificationReceipt } from "./product-v4-verification";
import { buildProductVerificationKey } from "@/lib/storage/keys";
import { getProductV4VerificationReadiness, readProductVerificationObject } from "./product-v4-verification-service";
import { isExpiredLegacyPdfAttempt, isSupersededLegacyPdfAttempt, listProcessingLegacyPdfRequests } from "./product-diktat-queue";

type Bundle = Awaited<ReturnType<typeof parseStagedProductBundle>>;
type Verification = Awaited<ReturnType<typeof getProductV4VerificationReadiness>> | null;
type EvidenceRow = typeof buktiPdfBundle.$inferSelect;

export async function readPublishedDiktatReceipt(row: typeof imporBundle.$inferSelect) {
  const ref = row.validationReport.productV4Verification as { stagingAuditId?: unknown; planHash?: unknown; attemptId?: unknown } | undefined;
  if (row.status !== "published" || row.version !== 4 || typeof ref?.stagingAuditId === "string" || typeof ref?.planHash !== "string" || !/^[a-f0-9]{64}$/.test(ref.planHash) || typeof ref.attemptId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(ref.attemptId)) return null;
  const [{ storage }, { resolveAuthSecret }] = await Promise.all([import("@/lib/storage"), import("@/lib/auth-secret")]);
  const bytes = await readProductVerificationObject(storage, buildProductVerificationKey(ref.planHash, `receipt-${ref.attemptId}.json`));
  if (!bytes || bytes.byteLength > 5 * 1024 * 1024 || !process.env.BETTER_AUTH_SECRET) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return null; }
  const receipt = authenticProductV4VerificationReceipt(parsed, { signingKey: resolveAuthSecret(), executorId: "zyx-product-v4-server-runner.v1" });
  return receipt?.planHash === ref.planHash ? receipt : null;
}

/** Historical preview only. This identity never supplies publication evidence. */
export async function publishedDiktatPreviewBindings(connection: Pick<typeof db, "select">, row: typeof imporBundle.$inferSelect, bundle: Bundle, rows: EvidenceRow[], receipt: ProductV4VerificationReceipt | null) {
  const bindings = new Map<string, ProductV4PdfBinding>();
  const ref = row.validationReport.productV4Verification as { stagingAuditId?: unknown; planHash?: unknown; attemptId?: unknown } | undefined;
  if (row.status !== "published" || row.version !== 4 || !row.courseId || typeof ref?.stagingAuditId === "string" || !receipt || receipt.planHash !== ref?.planHash || typeof ref.attemptId !== "string") return bindings;
  const [publication] = await connection.select({ id: publikasiBundle.id }).from(publikasiBundle).where(and(eq(publikasiBundle.imporBundleId, row.id), eq(publikasiBundle.status, "published"))).limit(1).for("share");
  if (!publication) return bindings;
  for (const product of bundle.products) {
    if (product.productType !== "diktat") continue;
    const [inventory] = await connection.select({ id: itemImporBundle.id }).from(itemImporBundle).where(and(eq(itemImporBundle.imporBundleId, row.id), eq(itemImporBundle.entityType, "diktat"), eq(itemImporBundle.entityId, product.id), eq(itemImporBundle.entityVersion, product.version), eq(itemImporBundle.entityHash, productEntityHash(product)), eq(itemImporBundle.status, "published"))).limit(1).for("share");
    if (!inventory) continue;
    const [canonical] = await connection.select().from(diktatMateri).where(eq(diktatMateri.id, productVersionId(product.id, product.version))).limit(1).for("share");
    if (!canonical || canonical.status !== "published" || canonical.version !== product.version || canonical.generationHash !== product.generationHash || canonical.sourceHash !== product.sourceHash || !canonical.fileKey) continue;
    const [course] = await connection.select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).where(eq(mataKuliah.id, canonical.mataKuliahId)).limit(1).for("share");
    if (!course || ![course.id, course.legacyCourseId].includes(row.courseId) || ![course.id, course.legacyCourseId].includes(bundle.manifest.courseId)) continue;
    const evidence = rows.find(evidence => evidence.imporBundleId === row.id && evidence.productId === product.id && evidence.status === "ready" && evidence.storageKey === canonical.fileKey && evidence.articleVersion === product.sourceArticleVersion && evidence.articleHash === product.sourceArticleHash && evidence.diktatHash === product.generationHash && !evidence.failureCode && evidence.pageCount && evidence.pageCount >= 1 && evidence.pageCount <= 4);
    const checkId = productV4VerificationRequirementId({ target: product.id, layer: "print", state: "pdf-fonts-assets-lineage-and-pages", viewport: null, artifactType: "application/pdf" });
    const results = receipt.results.filter(result => result.checkId === checkId);
    const result = results[0];
    const artifacts = result?.artifacts.filter(artifact => artifact.mediaType === "application/pdf") ?? [];
    const artifact = artifacts[0];
    if (evidence?.pageCount && results.length === 1 && result.status === "PASS" && result.pageCount === evidence.pageCount && artifacts.length === 1 && artifact.id.startsWith(`artifact-${ref.attemptId}-`) && buildProductVerificationKey(receipt.planHash, artifact.id) === canonical.fileKey) bindings.set(product.id, { storageKey: canonical.fileKey, printProfile: evidence.printProfile, pageCount: evidence.pageCount, checksum: artifact.checksum, byteLength: artifact.byteLength });
  }
  return bindings;
}

/** The status and preview use the same target and lineage selector as publication. */
export function selectDiktatPdfStatus(input: { importId: string; revision: string; bundle: Bundle; productId: string; rows: EvidenceRow[]; validationReport: Record<string, unknown>; verification: Verification; requestProcessing?: boolean; publishedPreviewBinding?: ProductV4PdfBinding }) {
  const diktat = input.bundle.products.find(product => product.productType === "diktat" && product.id === input.productId);
  if (!diktat || diktat.productType !== "diktat") throw new Error("PRODUCT_DIKTAT_NOT_FOUND");
  const article = input.bundle.products.find(product => product.productType === "article" && product.id === diktat.sourceArticleId);
  if (!article || article.productType !== "article") throw new Error("PRODUCT_DIKTAT_SOURCE_MISSING");
  if (input.requestProcessing && input.bundle.manifest.schemaVersion !== "product-bundle.v4") return { productId: diktat.id, revision: input.revision, status: "pending" as const, evidence: undefined };
  const v4Binding = input.bundle.manifest.schemaVersion === "product-bundle.v4"
    ? input.publishedPreviewBinding ?? resolveProductV4PdfBinding({ importId: input.importId, diktatId: diktat.id, validationReport: input.validationReport, verification: input.verification }) : undefined;
  const rows = input.rows.map(row => ({ ...row, storageKey: row.storageKey ?? undefined, pageCount: row.pageCount ?? undefined, failureCode: row.failureCode ?? undefined })) as PdfArtifactEvidence[];
  const selected = selectProductPdfEvidence({ rows, imporBundleId: input.importId, articleId: article.id, diktatId: diktat.id, articleVersion: article.version, articleHash: article.generationHash, diktatHash: diktat.generationHash, v4Binding });
  // Keep the database row pending so publication stays blocked, while exposing a
  // recoverable timeout even if no worker ever starts or writes a result.
  const evidence = selected && v4Binding === undefined && isSupersededLegacyPdfAttempt(selected, input.revision)
    ? { ...selected, status: "stale" as const }
    : selected && v4Binding === undefined && isExpiredLegacyPdfAttempt(selected)
      ? { ...selected, status: "failed" as const, failureCode: "RENDER_TIMEOUT" as const }
      : selected;
  const lineageMatches = Boolean(evidence && evidence.articleVersion === article.version && evidence.articleHash === article.generationHash && evidence.diktatHash === diktat.generationHash);
  const bindingMatches = v4Binding === undefined || Boolean(v4Binding && evidence && evidence.storageKey === v4Binding.storageKey && evidence.printProfile === v4Binding.printProfile && evidence.pageCount === v4Binding.pageCount);
  const readyValid = evidence?.status !== "ready" || Boolean(evidence.storageKey && evidence.pageCount && evidence.pageCount >= 1 && evidence.pageCount <= 4 && !evidence.failureCode);
  const status = !evidence ? "missing" : !lineageMatches || !bindingMatches || !readyValid ? "stale" : evidence.status;
  return { productId: diktat.id, revision: input.revision, status, evidence, pdfIntegrity: v4Binding ? { checksum: v4Binding.checksum, byteLength: v4Binding.byteLength } : undefined };
}

/** Load the exact requested revision; never fall back to a different product or revision. */
export async function getDiktatPdfContext(importId: string, productId: string, expectedRevision: string) {
  const row = await getProductBundleImport(importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (!/^[a-f0-9]{64}$/.test(expectedRevision) || row.checksum !== expectedRevision) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  const bundle = await parseStagedProductBundle(importId);
  if (bundle.checksum !== expectedRevision) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  const ref = row.validationReport.productV4Verification as { runId?: unknown } | undefined;
  const verification = row.version === 4 && typeof ref?.runId === "string" ? await getProductV4VerificationReadiness(importId, ref.runId).catch(() => null) : null;
  const historicalReceipt = await readPublishedDiktatReceipt(row);
  const selected = await db.transaction(async tx => {
    const [locked] = await tx.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1).for("update");
    if (!locked || locked.checksum !== row.checksum || locked.sourceUriOrKey !== row.sourceUriOrKey || locked.version !== row.version || locked.status !== row.status || JSON.stringify(locked.validationReport) !== JSON.stringify(row.validationReport)) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    const rows = await tx.select().from(buktiPdfBundle).where(eq(buktiPdfBundle.imporBundleId, importId));
    const publishedBindings = await publishedDiktatPreviewBindings(tx, locked, bundle, rows, historicalReceipt);
    const processing = row.version === 2 || row.version === 3 ? await listProcessingLegacyPdfRequests({ importId, expectedRevision, connection: tx }) : [];
    return selectDiktatPdfStatus({ importId, revision: expectedRevision, bundle, productId, rows, validationReport: row.validationReport, verification, publishedPreviewBinding: publishedBindings.get(productId), requestProcessing: processing.some(request => request.productId === productId) });
  });
  return { row, bundle, verification, historicalReceipt, ...selected };
}

export function assertDiktatPdfBytes(context: Awaited<ReturnType<typeof getDiktatPdfContext>>, bytes: Uint8Array) {
  if (context.row.version !== 4) return;
  const integrity = "pdfIntegrity" in context ? context.pdfIntegrity : undefined;
  if (!integrity?.checksum || bytes.byteLength !== integrity.byteLength || createHash("sha256").update(bytes).digest("hex") !== integrity.checksum) throw new Error("PRODUCT_DIKTAT_PDF_STALE");
}

/** Recheck after downloading bytes while replacement and evidence writes are locked out. */
export async function assertDiktatPdfStillCurrent(context: Awaited<ReturnType<typeof getDiktatPdfContext>>) {
  const refreshed = await getDiktatPdfContext(context.row.id, context.productId, context.revision);
  if (refreshed.status !== "ready" || refreshed.evidence?.id !== context.evidence?.id || refreshed.evidence?.storageKey !== context.evidence?.storageKey) throw new Error("PRODUCT_DIKTAT_PDF_STALE");
  await db.transaction(async tx => {
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, context.row.id)).limit(1).for("update");
    if (!row || row.checksum !== context.revision || row.sourceUriOrKey !== context.row.sourceUriOrKey || row.version !== context.row.version || row.status !== context.row.status || row.bundleId !== context.row.bundleId || row.courseId !== context.row.courseId || JSON.stringify(row.validationReport) !== JSON.stringify(context.row.validationReport) || JSON.stringify(row.validationReport) !== JSON.stringify(refreshed.row.validationReport)) throw new Error("PRODUCT_DIKTAT_PDF_STALE");
    const rows = await tx.select().from(buktiPdfBundle).where(eq(buktiPdfBundle.imporBundleId, row.id));
    const publishedBindings = await publishedDiktatPreviewBindings(tx, row, refreshed.bundle, rows, refreshed.historicalReceipt);
    const processing = row.version === 2 || row.version === 3 ? await listProcessingLegacyPdfRequests({ importId: row.id, expectedRevision: row.checksum, connection: tx }) : [];
    const selected = selectDiktatPdfStatus({ importId: row.id, revision: row.checksum, bundle: refreshed.bundle, productId: context.productId, rows, validationReport: row.validationReport, verification: refreshed.verification, publishedPreviewBinding: publishedBindings.get(context.productId), requestProcessing: processing.some(request => request.productId === context.productId) });
    if (selected.status !== "ready" || selected.evidence?.id !== context.evidence?.id || selected.evidence?.storageKey !== context.evidence?.storageKey) throw new Error("PRODUCT_DIKTAT_PDF_STALE");
  });
}
