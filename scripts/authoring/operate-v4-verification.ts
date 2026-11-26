import { and, eq } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildProductVerificationKey } from "@/lib/storage/keys";
import { normalizeDate, toIsoTimestamp } from "@/lib/date-utils";
import { assertV4OperationTarget } from "./v4-operation-target";
import { operateCloudTask, v4OperationQueueProvider } from "./v4-queue-operations";

async function inspectRunTrace(planHash: string, attemptId: string, createdAt: Date) {
  const signingKey = process.env.INNGEST_SIGNING_KEY, apiKey = process.env.INNGEST_API_KEY;
  if (!signingKey || !apiKey) return;
  const get = async (path: string, key: string) => {
    const response = await fetch(`https://api.inngest.com${path}`, { headers: { Authorization: `Bearer ${key}` }, redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) { console.log(JSON.stringify({ traceHttpStatus: response.status })); return null; }
    return response.json();
  };
  const events = await get(`/v1/events?name=product.verification.requested&limit=100&received_after=${encodeURIComponent(normalizeDate(createdAt).toISOString())}`, signingKey);
  const event = events?.data?.find((item: { data?: { planHash?: string; attemptId?: string } }) => item.data?.planHash === planHash && item.data?.attemptId === attemptId);
  if (!event?.internal_id) return;
  const runs = await get(`/v1/events/${encodeURIComponent(event.internal_id)}/runs`, signingKey);
  const run = runs?.data?.length === 1 ? runs.data[0] : undefined;
  if (!run?.run_id) return;
  console.log(JSON.stringify({ inngestStatus: run.status }));
  const queued = await get(`/v1/runs/${encodeURIComponent(run.run_id)}/jobs`, signingKey);
  for (const job of queued?.data ?? []) console.log(JSON.stringify({ retryScheduledAt: job.at, queuePosition: job.position, retryAttempt: job.attempt }));
  const trace = await get(`/v2/runs/${encodeURIComponent(run.run_id)}/trace?include=output&includeOutput=true`, apiKey);
  const sanitize = (value: string) => {
    let result = value;
    for (const secret of [signingKey, apiKey, process.env.BETTER_AUTH_SECRET, process.env.TURSO_AUTH_TOKEN, process.env.R2_SECRET_ACCESS_KEY, process.env.DATABASE_URL, process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY, process.env.STEEL_API_KEY, process.env.CF_API_TOKEN]) if (secret) result = result.replaceAll(secret, "[redacted]");
    return result.replace(/(?:https?|wss?):\/\/[^\s"<>]+/g, "[url]").replace(/[a-f0-9]{32,}/gi, "[hash]").replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi, "[id]").slice(0, 1500);
  };
  const errors = (output: unknown, depth = 0): string[] => {
    if (depth > 8) return [];
    if (typeof output === "string") {
      try { return errors(JSON.parse(output), depth + 1); } catch { return /error|fail|timeout|timed out|limit/i.test(output) ? [sanitize(output)] : []; }
    }
    if (!output || typeof output !== "object") return [];
    return Object.entries(output).flatMap(([key, value]) => /authorization|headers|token|secret/i.test(key) ? [] : key === "message" && typeof value === "string" ? [sanitize(value)] : errors(value, depth + 1));
  };
  interface Span { name?: string; status?: string; durationMs?: number; output?: unknown; children?: Span[] }
  const walk = (span: Span) => {
    console.log(JSON.stringify({ step: sanitize(span.name ?? ""), status: span.status, durationMs: span.durationMs, errors: span.status === "FAILED" ? errors(span.output).slice(0, 5) : [], outputFields: span.status === "FAILED" && span.output && typeof span.output === "object" ? Object.keys(span.output) : undefined }));
    for (const child of span.children ?? []) walk(child);
  };
  if (trace?.data?.rootSpan) walk(trace.data.rootSpan);
  return { runId: String(run.run_id), status: String(run.status) };
}

// Maintenance entrypoint. No review or publication writes are available here.
async function main() {
  const action = process.env.V4_OPERATION;
  const revision = process.env.V4_REVISION ?? "";
  if (!["inspect", "retry", "evidence", "cancel"].includes(action ?? "")) throw new Error("V4_OPERATION_INVALID");
  const target = assertV4OperationTarget(process.env);
  console.log(JSON.stringify({ ...target, action }));
  const [{ db }, { courses, imporBundle }, { getProductV4VerificationReadiness, requestProductV4Verification, cancelProductV4VerificationJob }, { parseStagedProductBundle }, { storage }, { latestProductV4StagingAudit }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("@/lib/bundle/product-v4-verification-service"),
    import("@/lib/bundle/product-staging"),
    import("@/lib/storage"),
    import("@/lib/bundle/product-v4-staging-identity"),
  ]);
  const rows = await db.select({ row: imporBundle, course: courses.title }).from(imporBundle).leftJoin(courses, eq(courses.id, imporBundle.courseId)).where(and(eq(imporBundle.bundleType, "product"), eq(imporBundle.version, 4), eq(imporBundle.status, "draft")));
  if (action === "inspect" && !revision) {
    for (const { row, course } of rows) console.log(JSON.stringify({ course, title: row.validationReport.bundleTitle, revision: row.checksum, status: row.status, hasVerification: Boolean(row.validationReport.productV4Verification) }));
    return;
  }
  if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error("V4_OPERATION_EXACT_REVISION_REQUIRED");
  const matches = rows.filter(({ row }) => row.checksum === revision);
  if (matches.length !== 1) throw new Error("V4_OPERATION_REVISION_NOT_UNIQUE_OR_NOT_DRAFT");
  const { row, course } = matches[0];
  const ref = row.validationReport.productV4Verification as { runId?: unknown; planHash?: unknown; attemptId?: unknown } | undefined;
  const staging = await latestProductV4StagingAudit(db, row.id);
  if (!staging?.correlationId || staging.afterSnapshot?.checksum !== row.checksum) throw new Error("V4_OPERATION_EXACT_STAGING_RUN_REQUIRED");
  const runId = staging.correlationId;
  console.log(JSON.stringify({ course, title: row.validationReport.bundleTitle, revision: row.checksum, status: row.status }));
  const queueProvider = v4OperationQueueProvider();
  let result = await getProductV4VerificationReadiness(row.id, runId);
  if (action === "cancel") {
    if (typeof ref?.planHash !== "string" || !/^[a-f0-9]{64}$/.test(ref.planHash) || typeof ref.attemptId !== "string" || !/^[a-f0-9-]{36}$/.test(ref.attemptId)) throw new Error("V4_OPERATION_ATTEMPT_INVALID");
    if (result.plan.planHash !== ref.planHash || !("attemptId" in result) || result.attemptId !== ref.attemptId) throw new Error("V4_OPERATION_ATTEMPT_STALE");
    if (queueProvider === "cloud-tasks") {
      const delivery = await operateCloudTask({ importId: row.id, runId, planHash: ref.planHash, attemptId: ref.attemptId, environment: target.environment, action: "cancel", verificationStatus: result.state.status });
      const cancelled = await cancelProductV4VerificationJob({ importId: row.id, runId, planHash: ref.planHash, attemptId: ref.attemptId });
      console.log(JSON.stringify({ ...delivery, attemptRevoked: cancelled.state.status === "cancelled", retryAvailable: true }));
      return;
    }
    const current = await inspectRunTrace(ref.planHash, ref.attemptId, row.createdAt);
    if (!current || !["Running", "Queued"].includes(current.status) || !process.env.INNGEST_API_KEY) throw new Error("V4_OPERATION_CANCELLABLE_RUN_REQUIRED");
    const endpoint = `https://api.inngest.com/v2/runs/${encodeURIComponent(current.runId)}`;
    const headers = { Authorization: `Bearer ${process.env.INNGEST_API_KEY}`, "Content-Type": "application/json" };
    const response = await fetch(`${endpoint}/cancel`, { method: "POST", headers, body: "{}", redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error("V4_OPERATION_CANCEL_FAILED");
    const after = await fetch(endpoint, { headers, redirect: "error", signal: AbortSignal.timeout(30_000) });
    const observed = after.ok ? await after.json() : null;
    const cancelled = await cancelProductV4VerificationJob({ importId: row.id, runId, planHash: ref.planHash, attemptId: ref.attemptId });
    console.log(JSON.stringify({ cancellationRequested: true, before: current.status, after: observed?.data?.status ?? null, attemptRevoked: cancelled.state.status === "cancelled", executionStopped: false, retryAvailable: true }));
    return;
  }
  const report = () => console.log(JSON.stringify({ status: result.state.status, completedChecks: "completedChecks" in result.state ? result.state.completedChecks : 0, totalChecks: result.plan.requirements.length, ready: result.evaluation.ready, failureCode: "failureCode" in result.state ? result.state.failureCode : null, retryAt: "retryAt" in result.state ? toIsoTimestamp(result.state.retryAt) : null }));
  report();
  if (action === "inspect") {
    const currentCheckId = "currentCheckId" in result.state ? result.state.currentCheckId : undefined;
    const currentCheck = result.plan.requirements.find(check => check.id === currentCheckId);
    const root = buildProductVerificationKey(result.plan.planHash).replace(/manifest\.json$/, "");
    const attemptId = "attemptId" in result ? result.attemptId : null;
    const artifacts = attemptId && storage.list ? (await storage.list(root)).filter(item => item.key.startsWith(`${root}artifact-${attemptId}-`)) : [];
    console.log(JSON.stringify({ currentLayer: currentCheck?.layer, currentState: currentCheck?.state, viewport: currentCheck?.viewport,
      updatedAt: "updatedAt" in result.state ? result.state.updatedAt : null, persistedArtifacts: artifacts.length, persistedBytes: artifacts.reduce((sum, item) => sum + item.size, 0) }));
    if (attemptId) {
      if (queueProvider === "cloud-tasks") console.log(JSON.stringify(await operateCloudTask({ importId: row.id, runId, planHash: result.plan.planHash, attemptId, environment: target.environment, action: "inspect" })));
      else await inspectRunTrace(result.plan.planHash, attemptId, row.createdAt);
    }
    return;
  }
  if (action === "retry") {
    await requestProductV4Verification({ importId: row.id, runId, expectedPlanHash: result.plan.planHash, retry: true });
    const deadline = Date.now() + 35 * 60_000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 15_000));
      result = await getProductV4VerificationReadiness(row.id, runId);
      report();
      if ("retryAt" in result.state && result.state.retryAt && result.state.retryAt > Date.now() + 60_000) {
        console.log(JSON.stringify({ verificationDeferredUntil: toIsoTimestamp(result.state.retryAt), verificationComplete: false }));
        return;
      }
      if (["failed", "stale", "cancelled"].includes(result.state.status)) throw new Error("V4_OPERATION_VERIFICATION_FAILED");
      if (result.state.status === "complete") {
        // PDF persistence is a separate final checkpoint; wait for its exact receipt marker.
        const [fresh] = await db.select().from(imporBundle).where(eq(imporBundle.id, row.id)).limit(1);
        const pdf = fresh?.validationReport.productV4PdfEvidence as { attemptId?: unknown; planHash?: unknown; receiptSignature?: unknown } | undefined;
        if (fresh?.checksum !== revision) throw new Error("V4_OPERATION_REVISION_CHANGED");
        const receipt = result.receipt as { signature?: unknown } | null;
        const requiresPdf = result.plan.requirements.some(check => check.layer === "print");
        if (result.evaluation.ready && !requiresPdf) {
          console.log(JSON.stringify({ verificationComplete: true }));
          return;
        }
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
