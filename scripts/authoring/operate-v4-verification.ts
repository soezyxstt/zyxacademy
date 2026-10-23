import { and, eq } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { courses, imporBundle } from "@/db/schema";
import { getProductV4VerificationReadiness, requestProductV4Verification } from "@/lib/bundle/product-v4-verification-service";
import { parseStagedProductBundle } from "@/lib/bundle/product-staging";
import { buildProductVerificationKey } from "@/lib/storage/keys";
import { storage } from "@/lib/storage";

// Maintenance entrypoint. No review or publication writes are available here.
async function main() {
  const action = process.env.V4_OPERATION;
  const revision = process.env.V4_REVISION ?? "";
  if (!["inspect", "retry", "evidence"].includes(action ?? "")) throw new Error("V4_OPERATION_INVALID");
  const environment = process.env.ZYX_ENVIRONMENT;
  const expectedOrigin = environment === "production" ? "https://www.zyxacademy.com" : environment === "staging" ? "https://staging.zyxacademy.com" : null;
  if (!expectedOrigin || process.env.NEXT_PUBLIC_APP_URL !== expectedOrigin) throw new Error("V4_OPERATION_ENVIRONMENT_INVALID");
  const databaseUrl = process.env.TURSO_CONNECTION_URL || process.env.DATABASE_URL;
  if (!databaseUrl || !/^(?:libsql|https):\/\//.test(databaseUrl)) throw new Error("V4_OPERATION_REMOTE_DATABASE_REQUIRED");
  console.log(JSON.stringify({ environment, origin: expectedOrigin, databaseHost: new URL(databaseUrl).hostname, action }));
  const rows = await db.select({ row: imporBundle, course: courses.title }).from(imporBundle).leftJoin(courses, eq(courses.id, imporBundle.courseId)).where(and(eq(imporBundle.bundleType, "product"), eq(imporBundle.version, 4), eq(imporBundle.status, "draft")));
  if (action === "inspect" && !revision) {
    for (const { row, course } of rows) console.log(JSON.stringify({ course, title: row.validationReport.bundleTitle, revision: row.checksum, status: row.status, hasVerification: Boolean(row.validationReport.productV4Verification) }));
    return;
  }
  if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error("V4_OPERATION_EXACT_REVISION_REQUIRED");
  const matches = rows.filter(({ row }) => row.checksum === revision);
  if (matches.length !== 1) throw new Error("V4_OPERATION_REVISION_NOT_UNIQUE_OR_NOT_DRAFT");
  const { row, course } = matches[0];
  const ref = row.validationReport.productV4Verification as { runId?: unknown } | undefined;
  if (typeof ref?.runId !== "string" || !ref.runId) throw new Error("V4_OPERATION_EXISTING_RUN_REQUIRED");
  const runId = ref.runId;
  console.log(JSON.stringify({ course, title: row.validationReport.bundleTitle, revision: row.checksum, status: row.status }));
  let result = await getProductV4VerificationReadiness(row.id, runId);
  const report = () => console.log(JSON.stringify({ status: result.state.status, completedChecks: "completedChecks" in result.state ? result.state.completedChecks : 0, totalChecks: result.plan.requirements.length, ready: result.evaluation.ready, failureCode: "failureCode" in result.state ? result.state.failureCode : null }));
  report();
  if (action === "inspect") {
    const currentCheckId = "currentCheckId" in result.state ? result.state.currentCheckId : undefined;
    const currentCheck = result.plan.requirements.find(check => check.id === currentCheckId);
    const root = buildProductVerificationKey(result.plan.planHash).replace(/manifest\.json$/, "");
    const attemptId = "attemptId" in result ? result.attemptId : null;
    const artifacts = attemptId && storage.list ? (await storage.list(root)).filter(item => item.key.startsWith(`${root}artifact-${attemptId}-`)) : [];
    console.log(JSON.stringify({ currentLayer: currentCheck?.layer, currentState: currentCheck?.state, viewport: currentCheck?.viewport,
      updatedAt: "updatedAt" in result.state ? result.state.updatedAt : null, persistedArtifacts: artifacts.length, persistedBytes: artifacts.reduce((sum, item) => sum + item.size, 0) }));
    return;
  }
  if (action === "retry") {
    await requestProductV4Verification({ importId: row.id, runId, expectedPlanHash: result.plan.planHash, retry: true });
    const deadline = Date.now() + 35 * 60_000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 15_000));
      result = await getProductV4VerificationReadiness(row.id, runId);
      report();
      if (["failed", "stale"].includes(result.state.status)) throw new Error("V4_OPERATION_VERIFICATION_FAILED");
      if (result.state.status === "complete") {
        // PDF persistence is a separate final checkpoint; wait for its exact receipt marker.
        const [fresh] = await db.select().from(imporBundle).where(eq(imporBundle.id, row.id)).limit(1);
        const pdf = fresh?.validationReport.productV4PdfEvidence as { attemptId?: unknown; planHash?: unknown; receiptSignature?: unknown } | undefined;
        if (fresh?.checksum !== revision) throw new Error("V4_OPERATION_REVISION_CHANGED");
        const receipt = result.receipt as { signature?: unknown } | null;
        if (result.evaluation.ready && pdf?.planHash === result.plan.planHash && pdf?.receiptSignature === receipt?.signature && "attemptId" in result && pdf?.attemptId === result.attemptId) {
          console.log(JSON.stringify({ verificationComplete: true, pdfEvidencePersisted: true }));
          return;
        }
        if (!result.evaluation.ready) throw new Error("V4_OPERATION_CHECKS_NOT_ALL_PASS");
      }
    }
    throw new Error("V4_OPERATION_POLL_TIMEOUT");
  }
  if (!result.evaluation.ready || !result.receipt || !("attemptId" in result)) throw new Error("V4_OPERATION_VERIFIED_EVIDENCE_REQUIRED");
  const receipt = result.receipt as { results: Array<{ checkId: string; status: string; artifacts: Array<{ id: string; mediaType: string; checksum: string; byteLength: number; pageNumber?: number }> }> };
  const output = "artifacts/v4-operations";
  await mkdir(output, { recursive: true });
  const index: unknown[] = [];
  for (const [checkIndex, check] of receipt.results.entries()) {
    const requirement = result.plan.requirements.find(item => item.id === check.checkId)!;
    for (const [artifactIndex, artifact] of check.artifacts.entries()) {
      const bytes = await storage.download!(buildProductVerificationKey(result.plan.planHash, artifact.id));
      if (bytes.byteLength !== artifact.byteLength || createHash("sha256").update(bytes).digest("hex") !== artifact.checksum) throw new Error("V4_OPERATION_EVIDENCE_CHANGED");
      const extension = artifact.mediaType === "image/png" ? "png" : artifact.mediaType === "application/pdf" ? "pdf" : "json";
      const filename = `check-${checkIndex}-${artifactIndex}.${extension}`;
      await writeFile(`${output}/${filename}`, bytes);
      index.push({ filename, layer: requirement.layer, state: requirement.state, viewport: requirement.viewport, pageNumber: artifact.pageNumber, status: check.status });
    }
  }
  const bundle = await parseStagedProductBundle(row.id);
  // Export learning content for independent review, omitting account/storage/identity metadata.
  const learningContent = bundle.products.map(product => product.productType === "article" ? { type: "article", title: product.title, sections: product.sections, visuals: product.visuals } : product.productType === "diktat" ? { type: "diktat", title: product.title, contentMarkdown: product.contentMarkdown } : { type: product.productType });
  await writeFile(`${output}/index.json`, JSON.stringify({ revision, checks: result.plan.requirements.length, artifacts: index, learningContent }, null, 2));
  console.log(JSON.stringify({ exportedArtifacts: index.length }));
}

main().catch(error => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "V4_OPERATION_FAILED";
  console.error(code);
  process.exitCode = 1;
});
