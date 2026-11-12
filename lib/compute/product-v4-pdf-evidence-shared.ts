import { createHash } from "node:crypto";
import { assertProductV4VerificationCurrent, deriveProductV4VerificationPlan, evaluateProductV4Verification, parseProductV4VerificationReceipt, type ProductV4VerificationAuthority, type ProductV4VerificationPlan, type ProductV4VerificationBinding } from "@/lib/bundle/product-v4-verification";
import type { ProductV4VerificationSnapshot } from "@/lib/bundle/product-v4-verification-core";
import { buildProductVerificationKey } from "@/lib/storage/keys";
import { PRODUCT_DIKTAT_PRINT_PROFILE, PRODUCT_DIKTAT_RENDERER_VERSION } from "@/lib/bundle/product-diktat-pdf";
import type { buktiPdfBundle, imporBundle } from "@/db/schema";

export function deriveProductV4PdfEvidence(input: {
  snapshot: ProductV4VerificationSnapshot; plan: ProductV4VerificationPlan; attemptId: string;
  receipt: unknown; authority: ProductV4VerificationAuthority; artifactBytes: ReadonlyMap<string, Uint8Array>;
}) {
  const { snapshot, plan, attemptId, authority } = input;
  if (snapshot.verificationAttemptId !== attemptId || snapshot.verificationPlanHash !== plan.planHash || plan.binding.importId !== snapshot.importId || plan.binding.printProfile !== PRODUCT_DIKTAT_PRINT_PROFILE) throw new Error("PRODUCT_V4_PDF_EVIDENCE_STALE");
  assertProductV4VerificationCurrent(plan, deriveProductV4VerificationPlan({ bundle: snapshot.bundle, binding: snapshot.binding }));
  const receipt = parseProductV4VerificationReceipt(input.receipt);
  if (!evaluateProductV4Verification(plan, [receipt], authority).ready) throw new Error("PRODUCT_V4_PDF_VERIFICATION_REQUIRED");
  const rows: Array<typeof buktiPdfBundle.$inferInsert> = [];
  for (const diktat of snapshot.bundle.products) {
    if (diktat.productType !== "diktat") continue;
    const article = snapshot.bundle.products.find((product) => product.productType === "article" && product.id === diktat.sourceArticleId);
    if (!article || article.productType !== "article" || article.generationHash !== diktat.sourceArticleHash || article.version !== diktat.sourceArticleVersion) throw new Error("PRODUCT_V4_PDF_LINEAGE_MISMATCH");
    const requirement = plan.requirements.find((check) => check.layer === "print" && check.artifactType === "application/pdf" && check.target === diktat.id);
    const check = receipt.results.find((result) => result.checkId === requirement?.id);
    const artifacts = check?.artifacts.filter((artifact) => artifact.mediaType === "application/pdf") ?? [];
    if (!check || check.status !== "PASS" || !check.pageCount || check.pageCount < 1 || check.pageCount > 4 || artifacts.length !== 1) throw new Error("PRODUCT_V4_PDF_ARTIFACT_REQUIRED");
    const artifact = artifacts[0];
    const bytes = input.artifactBytes.get(artifact.id);
    if (!artifact.id.startsWith(`artifact-${attemptId}-`) || !bytes || bytes.length !== artifact.byteLength || Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-" || createHash("sha256").update(bytes).digest("hex") !== artifact.checksum) throw new Error("PRODUCT_V4_PDF_ARTIFACT_MISMATCH");
    rows.push({ id: `pdf-v4-${createHash("sha256").update(`${snapshot.importId}:${diktat.id}:${diktat.generationHash}:${PRODUCT_DIKTAT_PRINT_PROFILE}`).digest("hex").slice(0, 32)}`,
      imporBundleId: snapshot.importId, productId: diktat.id, articleVersion: article.version, articleHash: article.generationHash, diktatHash: diktat.generationHash,
      rendererVersion: PRODUCT_DIKTAT_RENDERER_VERSION, printProfile: PRODUCT_DIKTAT_PRINT_PROFILE,
      storageKey: buildProductVerificationKey(plan.planHash, artifact.id), pageCount: check.pageCount, status: "ready" as const, failureCode: null });
  }
  return rows;
}

/** Trusted job completion only. Polling and caller-uploaded evidence never call this writer. */
export async function persistProductV4PdfEvidence(input: { snapshot: ProductV4VerificationSnapshot; plan: ProductV4VerificationPlan; attemptId: string; receipt: unknown }, buildProductV4RuntimeBinding: (input: { row: typeof imporBundle.$inferSelect & { courseId: string }; bundle: ProductV4VerificationSnapshot["bundle"]; runId: string }) => Promise<ProductV4VerificationBinding>) {
  const [{ db }, { imporBundle, buktiPdfBundle }, { and, eq }, { storage }, { resolveAuthSecret }] = await Promise.all([
    import("@/db"), import("@/db/schema"), import("drizzle-orm"), import("@/lib/storage"), import("@/lib/auth-secret"),
  ]);
  if (!process.env.BETTER_AUTH_SECRET || !storage.download) throw new Error("PRODUCT_V4_PDF_EVIDENCE_UNAVAILABLE");
  const receipt = parseProductV4VerificationReceipt(input.receipt);
  const artifactBytes = new Map<string, Uint8Array>();
  for (const result of receipt.results) for (const artifact of result.artifacts) if (artifact.mediaType === "application/pdf") artifactBytes.set(artifact.id, await storage.download(buildProductVerificationKey(input.plan.planHash, artifact.id)));
  const rows = deriveProductV4PdfEvidence({ ...input, receipt, artifactBytes, authority: { signingKey: resolveAuthSecret(), executorId: "zyx-product-v4-server-runner.v1" } });
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.snapshot.importId)).limit(1);
    const current = row?.validationReport.productV4Verification as { attemptId?: unknown; planHash?: unknown } | undefined;
    if (!row || row.status !== "draft" || row.checksum !== input.snapshot.checksum || row.sourceUriOrKey !== input.snapshot.sourceUriOrKey || current?.attemptId !== input.attemptId || current.planHash !== input.plan.planHash) throw new Error("PRODUCT_V4_PDF_EVIDENCE_CONFLICT");
    if (!row.courseId) throw new Error("PRODUCT_V4_COURSE_MISMATCH");
    const binding = await buildProductV4RuntimeBinding({ row: { ...row, courseId: row.courseId }, bundle: input.snapshot.bundle, runId: input.plan.binding.runId });
    assertProductV4VerificationCurrent(input.plan, deriveProductV4VerificationPlan({ bundle: input.snapshot.bundle, binding }));
    const claimed = await tx.update(imporBundle).set({ validationReport: { ...row.validationReport, productV4PdfEvidence: { planHash: input.plan.planHash, attemptId: input.attemptId, receiptSignature: receipt.signature } }, updatedAt: new Date() }).where(and(eq(imporBundle.id, row.id), eq(imporBundle.status, "draft"), eq(imporBundle.checksum, row.checksum), eq(imporBundle.sourceUriOrKey, row.sourceUriOrKey), eq(imporBundle.validationReport, row.validationReport))).returning({ id: imporBundle.id });
    if (claimed.length !== 1) throw new Error("PRODUCT_V4_PDF_EVIDENCE_CONFLICT");
    for (const evidence of rows) await tx.insert(buktiPdfBundle).values(evidence).onConflictDoUpdate({ target: [buktiPdfBundle.imporBundleId, buktiPdfBundle.productId, buktiPdfBundle.diktatHash, buktiPdfBundle.printProfile], set: { ...evidence, updatedAt: new Date() } });
  });
  return { productIds: rows.map((row) => row.productId) };
}
