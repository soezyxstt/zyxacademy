import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, buktiPdfBundle, imporBundle } from "@/db/schema";
import { minutesAgo, normalizeDate } from "@/lib/date-utils";
import { PRODUCT_DIKTAT_PRINT_PROFILE, PRODUCT_DIKTAT_RENDERER_VERSION } from "@/lib/materials/diktat-renderer-policy";
import { claimProductReviewSnapshot } from "./product-review-snapshot";
import type { parseStagedProductBundle } from "./product-staging";

// A fixed deadline from acceptance, including queue and worker retries.
export const LEGACY_PDF_ATTEMPT_TIMEOUT_MINUTES = 15;
const ATTEMPT_PREFIX = "pdf-queue-";
type Snapshot = typeof imporBundle.$inferSelect;
type Bundle = Awaited<ReturnType<typeof parseStagedProductBundle>>;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AttemptBinding = { attemptId: string; importId: string; requestedBy: string; productId: string; expectedRevision: string; articleVersion: number; articleHash: string; diktatHash: string; sourceUriOrKey: string; bundleId: string; courseId: string | null; version: number };

// Registration has its own deadline, independent of the accepted attempt deadline.
export const LEGACY_PDF_REQUEST_TIMEOUT_MINUTES = 15;
export type LegacyPdfRequest = { requestId: string; importId: string; requestedBy: string; productId: string; expectedRevision: string };
export type LegacyPdfRequestOutcome =
  | { requestId: string; outcome: "unknown" | "processing" }
  | { requestId: string; outcome: "accepted"; attemptId: string; duplicate: boolean; supersededByAttemptId?: string }
  | { requestId: string; outcome: "rejected"; error: string };
const REQUEST_TYPE = "product_diktat_pdf_request";
const requestAuditId = (requestId: string) => `pdf-request-${requestId}`;
const outcomeAuditId = (requestId: string) => `pdf-request-outcome-${requestId}`;

function assertRequestScope(input: LegacyPdfRequest) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.requestId) || !input.importId || !input.requestedBy || !input.productId.trim() || !/^[a-f0-9]{64}$/.test(input.expectedRevision)) throw new Error("PRODUCT_DIKTAT_REQUEST_INVALID");
}

function assertRegisteredScope(row: typeof auditMutasi.$inferSelect, input: LegacyPdfRequest) {
  if (row.entityType !== REQUEST_TYPE || row.action !== "registered" || row.entityId !== input.importId || row.actorId !== input.requestedBy || row.afterSnapshot?.productId !== input.productId || row.afterSnapshot?.revision !== input.expectedRevision) throw new Error("PRODUCT_DIKTAT_REQUEST_CONFLICT");
}

function isExpiredRequest(row: typeof auditMutasi.$inferSelect, now: Date) {
  return normalizeDate(row.createdAt).getTime() <= minutesAgo(LEGACY_PDF_REQUEST_TIMEOUT_MINUTES, now).getTime();
}

async function readRequestOutcome(tx: Transaction | typeof db, input: LegacyPdfRequest): Promise<{ registration: typeof auditMutasi.$inferSelect | undefined; result: LegacyPdfRequestOutcome }> {
  const [registration] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, requestAuditId(input.requestId))).limit(1);
  if (!registration) return { registration, result: { requestId: input.requestId, outcome: "unknown" } };
  assertRegisteredScope(registration, input);
  const [terminal] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, outcomeAuditId(input.requestId))).limit(1);
  if (!terminal) return { registration, result: { requestId: input.requestId, outcome: "processing" } };
  const data = terminal.afterSnapshot;
  if (terminal.entityType !== REQUEST_TYPE || terminal.entityId !== input.importId || terminal.actorId !== input.requestedBy || terminal.action !== "resolved") throw new Error("PRODUCT_DIKTAT_REQUEST_CONFLICT");
  if (data?.outcome === "accepted" && typeof data.attemptId === "string" && typeof data.duplicate === "boolean") return { registration, result: { requestId: input.requestId, outcome: "accepted", attemptId: data.attemptId, duplicate: data.duplicate } };
  if (data?.outcome === "rejected" && typeof data.error === "string") return { registration, result: { requestId: input.requestId, outcome: "rejected", error: data.error } };
  throw new Error("PRODUCT_DIKTAT_REQUEST_CONFLICT");
}

/** All outcome writers hold the import lock and append once. */
async function writeRequestOutcome(tx: Transaction, input: LegacyPdfRequest, value: { outcome: "accepted"; attemptId: string; duplicate: boolean } | { outcome: "rejected"; error: string }, now: Date) {
  await tx.insert(auditMutasi).values({ id: outcomeAuditId(input.requestId), actorId: input.requestedBy, entityType: REQUEST_TYPE, entityId: input.importId, action: "resolved", correlationId: input.requestId, afterSnapshot: value, createdAt: now }).onConflictDoNothing();
  return (await readRequestOutcome(tx, input)).result;
}

async function lockImport(tx: Transaction, importId: string) {
  return (await tx.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1).for("update"))[0];
}

/** Register before loading the staged ZIP. The UUID is globally bound to actor and target. */
export async function registerLegacyPdfRequest(input: LegacyPdfRequest, now?: Date): Promise<LegacyPdfRequestOutcome> {
  await assertAuthoringActor(db, input.requestedBy, { roles: ["admin"], error: "PRODUCT_DIKTAT_REQUEST_FORBIDDEN" });
  assertRequestScope(input);
  return db.transaction(async tx => {
    await assertAuthoringActor(tx, input.requestedBy, { roles: ["admin"], error: "PRODUCT_DIKTAT_REQUEST_FORBIDDEN", lock: true });
    const row = await lockImport(tx, input.importId);
    const at = now ?? new Date();
    await tx.insert(auditMutasi).values({ id: requestAuditId(input.requestId), actorId: input.requestedBy, entityType: REQUEST_TYPE, entityId: input.importId, action: "registered", correlationId: input.requestId, afterSnapshot: { productId: input.productId, revision: input.expectedRevision }, createdAt: at }).onConflictDoNothing();
    const state = await readRequestOutcome(tx, input);
    if (state.result.outcome !== "processing") return state.result;
    const error = isExpiredRequest(state.registration!, at) ? "PRODUCT_DIKTAT_REQUEST_TIMEOUT"
      : !row || row.bundleType !== "product" ? "PRODUCT_BUNDLE_NOT_FOUND"
      : row.checksum !== input.expectedRevision ? "PRODUCT_BUNDLE_STALE_CONTEXT"
      : row.version === 4 ? "PRODUCT_V4_TRUSTED_VERIFICATION_REQUIRED"
      : ![2, 3].includes(row.version) || row.status !== "draft" ? "PRODUCT_DIKTAT_RENDER_DRAFT_REQUIRED" : null;
    return error ? writeRequestOutcome(tx, input, { outcome: "rejected", error }, at) : state.result;
  });
}

/** Missing is intentionally unknown: an earlier POST may not have registered yet. */
export async function getLegacyPdfRequestOutcome(input: LegacyPdfRequest, now?: Date): Promise<LegacyPdfRequestOutcome> {
  await assertAuthoringActor(db, input.requestedBy, { roles: ["admin"], error: "PRODUCT_DIKTAT_REQUEST_FORBIDDEN" });
  assertRequestScope(input);
  const state = await readRequestOutcome(db, input);
  if (state.result.outcome !== "accepted" && (state.result.outcome !== "processing" || !isExpiredRequest(state.registration!, now ?? new Date()))) return state.result;
  return db.transaction(async tx => {
    await assertAuthoringActor(tx, input.requestedBy, { roles: ["admin"], error: "PRODUCT_DIKTAT_REQUEST_FORBIDDEN", lock: true });
    const row = await lockImport(tx, input.importId);
    const current = await readRequestOutcome(tx, input);
    const at = now ?? new Date();
    if (current.result.outcome === "accepted" && row?.checksum === input.expectedRevision) {
      const [attempt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, current.result.attemptId)).limit(1);
      const lineage = attempt?.afterSnapshot;
      if (attempt?.entityType === "product_diktat_pdf_attempt" && attempt.entityId === input.importId && lineage?.revision === input.expectedRevision && lineage.productId === input.productId && typeof lineage.diktatHash === "string") {
        const [replacement] = await tx.select().from(buktiPdfBundle).where(and(eq(buktiPdfBundle.imporBundleId, input.importId), eq(buktiPdfBundle.productId, input.productId), eq(buktiPdfBundle.diktatHash, lineage.diktatHash), eq(buktiPdfBundle.printProfile, PRODUCT_DIKTAT_PRINT_PROFILE))).limit(1);
        // Acceptance and all evidence replacements claim this same import lock.
        // This live attestation never rewrites the original immutable outcome.
        if (replacement && replacement.id !== current.result.attemptId && replacement.articleVersion === lineage.articleVersion && replacement.articleHash === lineage.articleHash) return { ...current.result, supersededByAttemptId: replacement.id };
      }
      return current.result;
    }
    if (current.result.outcome !== "processing" || !isExpiredRequest(current.registration!, at)) return current.result;
    return writeRequestOutcome(tx, input, { outcome: "rejected", error: "PRODUCT_DIKTAT_REQUEST_TIMEOUT" }, at);
  });
}

/** A preflight rejection races safely with acceptance and cannot overwrite it. */
export async function rejectLegacyPdfRequest(input: LegacyPdfRequest, error: string, now?: Date): Promise<LegacyPdfRequestOutcome> {
  await assertAuthoringActor(db, input.requestedBy, { roles: ["admin"], error: "PRODUCT_DIKTAT_REQUEST_FORBIDDEN" });
  assertRequestScope(input);
  return db.transaction(async tx => {
    await assertAuthoringActor(tx, input.requestedBy, { roles: ["admin"], error: "PRODUCT_DIKTAT_REQUEST_FORBIDDEN", lock: true });
    await lockImport(tx, input.importId);
    const state = await readRequestOutcome(tx, input);
    if (state.result.outcome !== "processing") return state.result;
    const at = now ?? new Date();
    return writeRequestOutcome(tx, input, { outcome: "rejected", error: isExpiredRequest(state.registration!, at) ? "PRODUCT_DIKTAT_REQUEST_TIMEOUT" : error }, at);
  });
}

/** Read-only, usable inside publication's locked transaction and by readiness callers. */
export async function listProcessingLegacyPdfRequests(input: { importId: string; expectedRevision: string; connection?: Transaction | typeof db; now?: Date }) {
  const connection = input.connection ?? db;
  const rows = await connection.select().from(auditMutasi).where(and(eq(auditMutasi.entityType, REQUEST_TYPE), eq(auditMutasi.entityId, input.importId)));
  const completed = new Set(rows.filter(row => row.action === "resolved").map(row => row.correlationId));
  const at = input.now ?? new Date();
  return rows.filter(row => row.action === "registered" && !completed.has(row.correlationId) && row.afterSnapshot?.revision === input.expectedRevision && typeof row.afterSnapshot.productId === "string" && !isExpiredRequest(row, at)).map(row => ({ requestId: row.correlationId!, productId: row.afterSnapshot!.productId as string }));
}

export function isExpiredLegacyPdfAttempt(row: { id: string; status: string; createdAt?: Date | string | null }, now = new Date()) {
  return row.id.startsWith(ATTEMPT_PREFIX) && row.status === "pending" && Boolean(row.createdAt && normalizeDate(row.createdAt).getTime() <= minutesAgo(LEGACY_PDF_ATTEMPT_TIMEOUT_MINUTES, now).getTime());
}

/** Pending attempts from a previous checksum must not prevent a new request. */
export function isSupersededLegacyPdfAttempt(row: { id: string; status: string }, revision: string) {
  return row.id.startsWith(ATTEMPT_PREFIX) && row.status === "pending" && !row.id.startsWith(`${ATTEMPT_PREFIX}${revision}-`);
}

function auditMatches(audit: typeof auditMutasi.$inferSelect | undefined, binding: AttemptBinding) {
  const data = audit?.afterSnapshot;
  return audit?.entityType === "product_diktat_pdf_attempt" && audit.entityId === binding.importId && audit.action === "queued" && audit.actorId === binding.requestedBy
    && data?.revision === binding.expectedRevision && data.productId === binding.productId && data.articleVersion === binding.articleVersion
    && data.articleHash === binding.articleHash && data.diktatHash === binding.diktatHash && data.printProfile === PRODUCT_DIKTAT_PRINT_PROFILE
    && data.sourceUriOrKey === binding.sourceUriOrKey && data.bundleId === binding.bundleId && data.courseId === binding.courseId && data.version === binding.version;
}

function evidenceMatches(row: typeof buktiPdfBundle.$inferSelect | undefined, binding: AttemptBinding) {
  return row?.id === binding.attemptId && row.imporBundleId === binding.importId && row.productId === binding.productId
    && row.articleVersion === binding.articleVersion && row.articleHash === binding.articleHash && row.diktatHash === binding.diktatHash
    && row.printProfile === PRODUCT_DIKTAT_PRINT_PROFILE && row.rendererVersion === PRODUCT_DIKTAT_RENDERER_VERSION;
}

/** Called only while the import snapshot is locked. A replay may observe its own terminal result. */
export async function claimQueuedLegacyPdfAttempt(tx: Transaction, binding: AttemptBinding, now = new Date()) {
  const [row] = await tx.select().from(buktiPdfBundle).where(eq(buktiPdfBundle.id, binding.attemptId)).limit(1);
  const [audit] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, binding.attemptId)).limit(1);
  if (!evidenceMatches(row, binding) || !auditMatches(audit, binding) || !row || row.status === "stale" || isExpiredLegacyPdfAttempt(row, now)) throw new Error("PRODUCT_DIKTAT_SNAPSHOT_CONFLICT");
  return row;
}

/** Reserve the evidence and revision binding before any event is sent. */
export async function reserveLegacyDiktatPdfAttempt(input: { snapshot: Snapshot; bundle: Bundle; productId: string; requestedBy: string; requestId: string; now?: Date }) {
  const { snapshot, bundle, productId, requestedBy } = input;
  await assertAuthoringActor(db, requestedBy, { roles: ["admin"], error: "PRODUCT_DIKTAT_REQUEST_FORBIDDEN" });
  const diktat = bundle.products.find(product => product.productType === "diktat" && product.id === productId);
  if (!diktat || diktat.productType !== "diktat") throw new Error("PRODUCT_DIKTAT_NOT_FOUND");
  const article = bundle.products.find(product => product.productType === "article" && product.id === diktat.sourceArticleId);
  if (!article || article.productType !== "article") throw new Error("PRODUCT_DIKTAT_SOURCE_MISSING");
  if (snapshot.bundleType !== "product" || ![2, 3].includes(snapshot.version) || snapshot.status !== "draft" || bundle.checksum !== snapshot.checksum) throw new Error("PRODUCT_DIKTAT_SNAPSHOT_CONFLICT");
  const request: LegacyPdfRequest = { requestId: input.requestId, importId: snapshot.id, productId, requestedBy, expectedRevision: snapshot.checksum };
  assertRequestScope(request);
  const result = await db.transaction(async tx => {
    await assertAuthoringActor(tx, requestedBy, { roles: ["admin"], error: "PRODUCT_DIKTAT_REQUEST_FORBIDDEN", lock: true });
    await lockImport(tx, snapshot.id);
    const now = input.now ?? new Date();
    const state = await readRequestOutcome(tx, request);
    if (state.result.outcome === "accepted") return { ...state.result, duplicate: true };
    if (state.result.outcome === "rejected") return state.result;
    if (state.result.outcome === "unknown") throw new Error("PRODUCT_DIKTAT_REQUEST_NOT_REGISTERED");
    if (isExpiredRequest(state.registration!, now)) return writeRequestOutcome(tx, request, { outcome: "rejected", error: "PRODUCT_DIKTAT_REQUEST_TIMEOUT" }, now);
    try { await claimProductReviewSnapshot(tx, snapshot, now); } catch { return writeRequestOutcome(tx, request, { outcome: "rejected", error: "PRODUCT_DIKTAT_SNAPSHOT_CONFLICT" }, now); }
    const [current] = await tx.select().from(imporBundle).where(eq(imporBundle.id, snapshot.id)).limit(1);
    if (!current || current.version !== snapshot.version || current.bundleType !== snapshot.bundleType || current.bundleId !== snapshot.bundleId || current.courseId !== snapshot.courseId) return writeRequestOutcome(tx, request, { outcome: "rejected", error: "PRODUCT_DIKTAT_SNAPSHOT_CONFLICT" }, now);
    const [existing] = await tx.select().from(buktiPdfBundle).where(and(eq(buktiPdfBundle.imporBundleId, snapshot.id), eq(buktiPdfBundle.productId, productId), eq(buktiPdfBundle.diktatHash, diktat.generationHash), eq(buktiPdfBundle.printProfile, PRODUCT_DIKTAT_PRINT_PROFILE))).limit(1);
    if (existing?.status === "pending" && !isExpiredLegacyPdfAttempt(existing, now)) {
      const [audit] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, existing.id)).limit(1);
      // The original actor owns the event, but another admin can observe the same attempt.
      const binding = { attemptId: existing.id, importId: snapshot.id, requestedBy: audit?.actorId ?? "", productId, expectedRevision: snapshot.checksum, articleVersion: article.version, articleHash: article.generationHash, diktatHash: diktat.generationHash, sourceUriOrKey: snapshot.sourceUriOrKey, bundleId: snapshot.bundleId, courseId: snapshot.courseId, version: snapshot.version };
      if (evidenceMatches(existing, binding) && auditMatches(audit, binding)) return writeRequestOutcome(tx, request, { outcome: "accepted", attemptId: existing.id, duplicate: true }, now);
    }
    const attemptId = `${ATTEMPT_PREFIX}${snapshot.checksum}-${randomUUID()}`;
    const base = { id: attemptId, imporBundleId: snapshot.id, productId, articleVersion: article.version, articleHash: article.generationHash, diktatHash: diktat.generationHash, rendererVersion: PRODUCT_DIKTAT_RENDERER_VERSION, printProfile: PRODUCT_DIKTAT_PRINT_PROFILE };
    await tx.insert(buktiPdfBundle).values({ ...base, status: "pending", createdAt: now, updatedAt: now }).onConflictDoUpdate({
      target: [buktiPdfBundle.imporBundleId, buktiPdfBundle.productId, buktiPdfBundle.diktatHash, buktiPdfBundle.printProfile],
      set: { ...base, status: "pending", storageKey: null, pageCount: null, failureCode: null, createdAt: now, updatedAt: now },
    });
    await tx.insert(auditMutasi).values({ id: attemptId, actorId: requestedBy, entityType: "product_diktat_pdf_attempt", entityId: snapshot.id, action: "queued", correlationId: attemptId, afterSnapshot: { revision: snapshot.checksum, productId, articleVersion: article.version, articleHash: article.generationHash, diktatHash: diktat.generationHash, printProfile: PRODUCT_DIKTAT_PRINT_PROFILE, sourceUriOrKey: snapshot.sourceUriOrKey, bundleId: snapshot.bundleId, courseId: snapshot.courseId, version: snapshot.version }, createdAt: now });
    return writeRequestOutcome(tx, request, { outcome: "accepted", attemptId, duplicate: false }, now);
  });
  if (result.outcome !== "accepted") throw new Error(result.outcome === "rejected" ? result.error : "PRODUCT_DIKTAT_REQUEST_NOT_REGISTERED");
  return { attemptId: result.attemptId, duplicate: result.duplicate };
}

/** Queue rejection may only fail its own still-pending row, never a ready or replacement row. */
export async function failLegacyDiktatPdfEnqueue(importId: string, attemptId: string) {
  await db.transaction(async tx => {
    await tx.select({ id: imporBundle.id }).from(imporBundle).where(eq(imporBundle.id, importId)).limit(1).for("update");
    await tx.update(buktiPdfBundle).set({ status: "failed", failureCode: "RENDER_UNAVAILABLE", storageKey: null, pageCount: null, updatedAt: new Date() }).where(and(eq(buktiPdfBundle.imporBundleId, importId), eq(buktiPdfBundle.id, attemptId), eq(buktiPdfBundle.status, "pending")));
  });
}
