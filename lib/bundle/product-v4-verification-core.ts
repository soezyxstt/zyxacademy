import { verificationBrowserFailureCode } from "@/lib/compute/product-v4-browser-config";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { RetryAfterError } from "inngest";
import { buildProductVerificationKey } from "@/lib/storage/keys";
import { isCurrentProductV4PdfAttachment } from "./product-pdf-selection";
import { assertProductV4VerificationCurrent, deriveProductV4VerificationPlan, evaluateProductV4Verification, recordProductV4VerificationReport, runProductV4Verification, type ProductV4ObservedCheck, type ProductV4VerificationAuthority, type ProductV4VerificationBinding, type ProductV4VerificationPlan, type ProductV4VerificationReceipt, type ProductV4VerificationRequirement, type ProductV4VerificationResult } from "./product-v4-verification";
import type { ProductBundleManifest, ProductDependency, ProductEntity } from "./product-validator";
import { type ProductV4StagingSnapshot } from "./product-v4-staging-identity";

export interface ProductV4VerificationSnapshot extends ProductV4StagingSnapshot {
  verificationAttemptId?: string | null;
  verificationPlanHash?: string | null;
  pdfEvidenceAttachment?: unknown;
  binding: ProductV4VerificationBinding;
  bundle: { manifest: ProductBundleManifest; products: readonly ProductEntity[]; dependencies: readonly ProductDependency[] };
}
export interface ProductV4VerificationPorts {
  load(importId: string, runId: string): Promise<ProductV4VerificationSnapshot>;
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, bytes: Uint8Array, mediaType: string): Promise<void>;
  enqueue(input: { importId: string; runId: string; planHash: string; attemptId: string }): Promise<void>;
  attach(snapshot: ProductV4VerificationSnapshot, planHash: string, attemptId: string, expectedAttemptId: string | null): Promise<boolean>;
  persistPdfEvidence(input: { snapshot: ProductV4VerificationSnapshot; plan: ProductV4VerificationPlan; attemptId: string; receipt: ProductV4VerificationReceipt }): Promise<void>;
  hasPdfEvidence(input: { snapshot: ProductV4VerificationSnapshot; plan: ProductV4VerificationPlan; attemptId: string; receipt: ProductV4VerificationReceipt }): Promise<boolean>;
  execute(input: { plan: ProductV4VerificationPlan; bundle: ProductV4VerificationSnapshot["bundle"]; requirement: ProductV4VerificationRequirement; captureOffset?: number; captureLimit?: number }): Promise<ProductV4ObservedCheck>;
  authority(): ProductV4VerificationAuthority;
}
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const jobSchema = z.object({ importId: z.string().min(1), runId: z.string().min(1), planHash: hash }).strict();
const attemptSchema = jobSchema.extend({ attemptId: z.string().uuid() });
const stateSchema = z.object({ attemptId: z.string().uuid(), status: z.enum(["pending", "running", "complete", "failed", "stale"]), receiptKey: z.string().optional(), failureCode: z.string().max(100).optional(), updatedAt: z.number().int().optional(), retryAt: z.number().int().optional(), completedChecks: z.number().int().nonnegative().optional(), totalChecks: z.number().int().positive().optional(), currentCheckId: hash.optional() }).strict();
export type ProductV4VerificationCheckpoint = <T>(id: string, execute: () => Promise<T>) => Promise<T>;
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

export async function readProductVerificationObject(provider: { download?: (key: string) => Promise<Uint8Array> }, key: string): Promise<Uint8Array | null> {
  if (!provider.download) throw new Error("STORAGE_DOWNLOAD_UNSUPPORTED");
  try { return await provider.download(key); }
  catch (error) {
    const cause = (error instanceof Error ? error.cause ?? error : error) as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
    const status = cause?.$metadata?.httpStatusCode;
    if (status === 404 || (status === undefined && (cause?.name === "NoSuchKey" || cause?.name === "NotFound"))) return null;
    throw error;
  }
}

/** Storage manifest is written after artifacts; only an atomic import attachment makes it current. */
export function createProductV4VerificationService(ports: ProductV4VerificationPorts) {
  const current = async (importId: string, runId: string) => {
    const snapshot = await ports.load(importId, runId);
    const plan = deriveProductV4VerificationPlan({ bundle: snapshot.bundle, binding: snapshot.binding });
    return { snapshot, plan };
  };
  const invalidMetadata = Symbol("invalid verification metadata");
  const readMetadata = async (key: string) => {
    const read = async () => {
      const bytes = await ports.read(key);
      if (!bytes) return null;
      if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("PRODUCT_V4_VERIFICATION_MANIFEST_TOO_LARGE");
      try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch (error) {
        if (error instanceof SyntaxError || (error instanceof TypeError && "code" in error && error.code === "ERR_ENCODING_INVALID_ENCODED_DATA")) return invalidMetadata;
        throw error;
      }
    };
    let value = await read();
    for (let retry = 0; !value && retry < 2; retry++) {
      await new Promise(resolve => setTimeout(resolve, 50 * 2 ** retry));
      value = await read();
    }
    return value;
  };
  const get = async (input: { importId: string; runId: string; planHash: string }) => {
    jobSchema.parse(input);
    const { snapshot, plan } = await current(input.importId, input.runId);
    if (plan.planHash !== input.planHash) throw new Error("PRODUCT_V4_VERIFICATION_CONFLICT");
    const attemptId = snapshot.verificationAttemptId;
    if (!attemptId || (snapshot.verificationPlanHash && snapshot.verificationPlanHash !== plan.planHash)) throw new Error("PRODUCT_V4_VERIFICATION_JOB_NOT_FOUND");
    z.string().uuid().parse(attemptId);
    const failedMetadata = (invalid = false) => ({ jobId: plan.planHash, attemptId, stagingAuditId: snapshot.stagingAuditId, plan, state: stateSchema.parse({ attemptId, status: "failed", failureCode: invalid ? "PRODUCT_V4_VERIFICATION_METADATA_INVALID" : "PRODUCT_V4_VERIFICATION_METADATA_MISSING" }), receipt: null, evaluation: evaluateProductV4Verification(plan, [], ports.authority()) });
    const manifest = await readMetadata(buildProductVerificationKey(plan.planHash, `manifest-${attemptId}.json`));
    if (!manifest) return failedMetadata();
    const parsedJob = attemptSchema.safeParse(manifest);
    if (!parsedJob.success) return failedMetadata(true);
    const job = parsedJob.data;
    if (job.importId !== input.importId || job.runId !== input.runId || job.planHash !== plan.planHash) throw new Error("PRODUCT_V4_VERIFICATION_SCOPE_MISMATCH");
    const stateKey = buildProductVerificationKey(plan.planHash, `state-${attemptId}.json`);
    const storedState = await readMetadata(stateKey);
    if (!storedState) return failedMetadata();
    const parsedState = stateSchema.safeParse(storedState);
    if (!parsedState.success) return failedMetadata(true);
    const state = parsedState.data;
    if (["pending", "running"].includes(state.status) && (!state.updatedAt || Date.now() - Math.max(state.updatedAt, state.retryAt ?? 0) > 20 * 60_000)) {
      state.status = "failed";
      state.failureCode = "PRODUCT_V4_VERIFICATION_LEASE_EXPIRED";
    }
    if (state.attemptId !== attemptId || job.attemptId !== attemptId) throw new Error("PRODUCT_V4_VERIFICATION_ATTEMPT_STALE");
    if (state.receiptKey && state.receiptKey !== `receipt-${attemptId}.json`) throw new Error("PRODUCT_V4_VERIFICATION_ATTEMPT_STALE");
    const receipt = state.receiptKey ? await readMetadata(buildProductVerificationKey(plan.planHash, state.receiptKey)) : null;
    if (receipt === invalidMetadata) return failedMetadata(true);
    const evaluation = evaluateProductV4Verification(plan, receipt ? [receipt] : [], ports.authority());
    if (evaluation.ready && receipt) {
      const artifacts = (receipt as ProductV4VerificationReceipt).results.flatMap(result => result.artifacts);
      let damaged = false;
      for (let start = 0; start < artifacts.length; start += 8) {
        await Promise.all(artifacts.slice(start, start + 8).map(async artifact => {
          if (!artifact.id.startsWith(`artifact-${attemptId}-`)) throw new Error("PRODUCT_V4_VERIFICATION_ATTEMPT_STALE");
          const bytes = await ports.read(buildProductVerificationKey(plan.planHash, artifact.id));
          if (!bytes || bytes.byteLength !== artifact.byteLength || createHash("sha256").update(bytes).digest("hex") !== artifact.checksum) damaged = true;
        }));
      }
      if (damaged) {
        state.status = "failed";
        state.failureCode = "PRODUCT_V4_VERIFICATION_ARTIFACT_MISSING_OR_CHANGED";
      }
    }
    if (state.status === "complete" && (!evaluation.ready || !receipt || !isCurrentProductV4PdfAttachment(snapshot.pdfEvidenceAttachment, plan.planHash, attemptId, (receipt as ProductV4VerificationReceipt).signature) || !await ports.hasPdfEvidence({ snapshot, plan, attemptId, receipt: receipt as ProductV4VerificationReceipt }))) {
      state.status = "failed";
      state.failureCode = "PRODUCT_V4_PDF_EVIDENCE_REQUIRED";
    }
    return { jobId: plan.planHash, attemptId, stagingAuditId: snapshot.stagingAuditId, plan, state, receipt, evaluation: { ...evaluation, ready: state.status === "complete" && evaluation.ready } };
  };
  return {
    current,
    get,
    async fail(input: { importId: string; runId: string; planHash: string; attemptId: string }) {
      const { snapshot, plan } = await current(input.importId, input.runId);
      if (plan.planHash !== input.planHash || snapshot.verificationAttemptId !== input.attemptId) return;
      const previous = await get({ importId: input.importId, runId: input.runId, planHash: input.planHash });
      if (previous.state.status === "complete") return;
      await ports.write(buildProductVerificationKey(plan.planHash, `state-${input.attemptId}.json`), encode({ ...previous.state, status: "failed", updatedAt: Date.now(), failureCode: previous.state.failureCode ?? "PRODUCT_V4_VERIFICATION_WORKER_FAILED" }), "application/json");
    },
    async readiness(importId: string, runId: string) {
      const { snapshot, plan } = await current(importId, runId);
      if (!snapshot.verificationAttemptId || (snapshot.verificationPlanHash && snapshot.verificationPlanHash !== plan.planHash)) return {
        jobId: null, stagingAuditId: snapshot.stagingAuditId, plan, state: { status: "pending" as const }, receipt: null,
        evaluation: evaluateProductV4Verification(plan, [], ports.authority()),
      };
      return get({ importId, runId, planHash: plan.planHash });
    },
    async request(input: { importId: string; runId: string; expectedPlanHash?: string; retry?: boolean }) {
      const { snapshot, plan } = await current(input.importId, input.runId);
      if (input.expectedPlanHash && input.expectedPlanHash !== plan.planHash) throw new Error("PRODUCT_V4_VERIFICATION_CONFLICT");
      const previousAttempt = snapshot.verificationAttemptId ?? null;
      if (previousAttempt && (!snapshot.verificationPlanHash || snapshot.verificationPlanHash === plan.planHash)) {
        const previous = await get({ importId: input.importId, runId: input.runId, planHash: plan.planHash });
        if (!input.retry) return previous;
        if (previous.evaluation.ready || previous.state.status === "running" || previous.state.status === "pending") throw new Error("PRODUCT_V4_VERIFICATION_RETRY_NOT_ALLOWED");
      }
      const attemptId = randomUUID();
      const job = { importId: input.importId, runId: input.runId, planHash: plan.planHash, attemptId };
      await ports.write(buildProductVerificationKey(plan.planHash, `manifest-${attemptId}.json`), encode(job), "application/json");
      await ports.write(buildProductVerificationKey(plan.planHash, `state-${attemptId}.json`), encode({ attemptId, status: "pending", updatedAt: Date.now(), completedChecks: 0, totalChecks: plan.requirements.length }), "application/json");
      if (!await ports.attach(snapshot, plan.planHash, attemptId, previousAttempt)) throw new Error("PRODUCT_V4_VERIFICATION_CONFLICT");
      try { await ports.enqueue(job); }
      catch (error) {
        await ports.write(buildProductVerificationKey(plan.planHash, `state-${attemptId}.json`), encode({ attemptId, status: "failed", failureCode: "PRODUCT_V4_VERIFICATION_ENQUEUE_FAILED" }), "application/json");
        throw error;
      }
      return get({ importId: input.importId, runId: input.runId, planHash: plan.planHash });
    },
    async process(input: { importId: string; runId: string; planHash: string; attemptId?: string }, checkpoint: ProductV4VerificationCheckpoint = (_id, execute) => execute()) {
      jobSchema.parse({ importId: input.importId, runId: input.runId, planHash: input.planHash });
      const { snapshot, plan, existing } = await checkpoint("prepare-verification", async () => ({
        ...await current(input.importId, input.runId),
        existing: await get({ importId: input.importId, runId: input.runId, planHash: input.planHash }),
      }));
      if (plan.planHash !== input.planHash) throw new Error("PRODUCT_V4_VERIFICATION_CONFLICT");
      const attemptId = z.string().uuid().parse(input.attemptId ?? snapshot.verificationAttemptId);
      if (attemptId !== snapshot.verificationAttemptId) throw new Error("PRODUCT_V4_VERIFICATION_ATTEMPT_STALE");
      const getInput = { importId: input.importId, runId: input.runId, planHash: input.planHash };
      const assertAttempt = async () => {
        const fresh = await current(input.importId, input.runId);
        assertProductV4VerificationCurrent(plan, fresh.plan);
        if (fresh.snapshot.stagingAuditId !== snapshot.stagingAuditId || fresh.snapshot.stagingRunId !== snapshot.stagingRunId || fresh.snapshot.verificationAttemptId !== attemptId) throw new Error("PRODUCT_V4_VERIFICATION_ATTEMPT_STALE");
      };
      const stateKey = buildProductVerificationKey(plan.planHash, `state-${attemptId}.json`);
      if (existing.state.status === "complete") return existing;
      let completedChecks = 0;
      let attachingPdf = false;
      try {
        const receipt = await runProductV4Verification(plan, ports.authority(), async (requirement) => {
          let offset = 0;
          let total = 1;
          let observed: ProductV4VerificationResult | undefined;
          do {
            const stored = await checkpoint(`verify-${requirement.id}-${offset}`, async () => {
              await assertAttempt();
              await ports.write(stateKey, encode({ attemptId, status: "running", updatedAt: Date.now(), completedChecks, totalChecks: plan.requirements.length, currentCheckId: requirement.id }), "application/json");
              let result: ProductV4ObservedCheck;
              try {
                result = await ports.execute({ plan, bundle: snapshot.bundle, requirement, ...(requirement.layer === "web" ? { captureOffset: offset, captureLimit: 2 } : {}) });
              } catch (error) {
                if (error instanceof RetryAfterError) {
                  const retryAt = /^\d+$/.test(error.retryAfter) ? Date.now() + Number(error.retryAfter) * 1000 : Date.parse(error.retryAfter);
                  if (!Number.isSafeInteger(retryAt) || retryAt <= Date.now()) throw new Error("PRODUCT_V4_VERIFICATION_RETRY_TIME_INVALID");
                  await ports.write(stateKey, encode({ attemptId, status: "pending", updatedAt: Date.now(), retryAt, completedChecks, totalChecks: plan.requirements.length, currentCheckId: requirement.id, failureCode: verificationBrowserFailureCode(error) ?? "VERIFICATION_BROWSER_RATE_LIMITED" }), "application/json");
                }
                throw error;
              }
              await assertAttempt();
              const artifacts: ProductV4ObservedCheck["artifacts"] = [];
              for (let start = 0; start < result.artifacts.length; start += 8) {
                artifacts.push(...await Promise.all(result.artifacts.slice(start, start + 8).map(async (artifact, index) => {
                  const extension = artifact.mediaType === "image/png" ? "png" : artifact.mediaType === "application/pdf" ? "pdf" : "json";
                  const id = `artifact-${attemptId}-${requirement.id}-${offset + start + index}.${extension}`;
                  await ports.write(buildProductVerificationKey(plan.planHash, id), artifact.bytes, artifact.mediaType);
                  return { ...artifact, id };
                })));
              }
              const persisted = recordProductV4VerificationReport(plan, [{ ...result, artifacts }], ports.authority()).results[0];
              await ports.write(stateKey, encode({ attemptId, status: "running", updatedAt: Date.now(), completedChecks, totalChecks: plan.requirements.length }), "application/json");
              return { ...persisted, ...(result.captureTotal === undefined ? {} : { captureTotal: result.captureTotal }) };
            });
            const { captureTotal, ...batch } = stored;
            observed = { ...batch, artifacts: [...(observed?.artifacts ?? []), ...batch.artifacts] };
            if (captureTotal !== undefined && (!Number.isInteger(captureTotal) || captureTotal < 1 || captureTotal > 300 || (offset > 0 && total !== captureTotal) || batch.artifacts.length === 0 || offset + batch.artifacts.length > captureTotal)) throw new Error("PRODUCT_V4_CAPTURE_BATCH_INVALID");
            offset += batch.artifacts.length;
            total = captureTotal ?? offset;
          } while (offset < total && observed.status === "PASS");
          completedChecks++;
          return observed;

        });
        return await checkpoint("finalize-verification", async () => {
          await assertAttempt();
          if (!await ports.attach(snapshot, plan.planHash, attemptId, attemptId)) throw new Error("PRODUCT_V4_VERIFICATION_CONFLICT");
          const receiptKey = `receipt-${attemptId}.json`;
          await ports.write(buildProductVerificationKey(plan.planHash, receiptKey), encode(receipt), "application/json");
          await assertAttempt();
          if (!evaluateProductV4Verification(plan, [receipt], ports.authority()).ready) {
            await ports.write(stateKey, encode({ attemptId, status: "failed", receiptKey, updatedAt: Date.now(), completedChecks, totalChecks: plan.requirements.length, failureCode: "PRODUCT_V4_VERIFICATION_CHECKS_FAILED" }), "application/json");
            return get(getInput);
          }
          const fresh = await current(input.importId, input.runId);
          assertProductV4VerificationCurrent(plan, fresh.plan);
          if (fresh.snapshot.stagingAuditId !== snapshot.stagingAuditId || fresh.snapshot.stagingRunId !== snapshot.stagingRunId || fresh.snapshot.verificationAttemptId !== attemptId) throw new Error("PRODUCT_V4_VERIFICATION_ATTEMPT_STALE");
          attachingPdf = true;
          await ports.persistPdfEvidence({ snapshot: fresh.snapshot, plan, attemptId, receipt });
          attachingPdf = false;
          await assertAttempt();
          await ports.write(stateKey, encode({ attemptId, status: "complete", receiptKey, updatedAt: Date.now(), completedChecks, totalChecks: plan.requirements.length }), "application/json");
          return get(getInput);
        });
      } catch (error) {
        if (error instanceof RetryAfterError) throw error;
        const stale = error instanceof Error && ["PRODUCT_V4_VERIFICATION_CONFLICT", "PRODUCT_V4_VERIFICATION_ATTEMPT_STALE"].includes(error.message);
        const browserFailure = verificationBrowserFailureCode(error);
        await ports.write(stateKey, encode({ attemptId, status: stale ? "stale" : "failed", updatedAt: Date.now(), completedChecks, totalChecks: plan.requirements.length, failureCode: stale ? "PRODUCT_V4_VERIFICATION_CONFLICT" : attachingPdf ? "PRODUCT_V4_PDF_EVIDENCE_PERSIST_FAILED" : browserFailure ?? "PRODUCT_V4_VERIFICATION_EXECUTION_FAILED" }), "application/json");
        throw error;
      }
    },
  };
}
