import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { authoringTransfer, authoringTransferItem, authoringTransferOutbox, artikel, bab, bagianPembelajaran, courses, diktatMateri, flashcard, ide, imporBundle, mataKuliah, pengguna, potonganSumber, setFlashcard, sumberMateri } from "@/db/schema";
import { buildTransferArtifactKey } from "@/lib/storage/keys";
import { deadlineInSeconds } from "@/lib/date-utils";
import { executeInputSchema, fail, planInputSchema, sha256, stableJson, validateInventory, type TransferIssue } from "./contracts";
import { capabilities, openLocal, peerFor, peerRequest, signToken, verifyToken, type TransferConfig } from "./security";
import { requireTransferActor } from "./source";
import { auditTransfer } from "./audit";
import { CLEANUP_CLAIM } from "./cleanup";

const planSchema = z.object({ sourcePeerId: z.string(), grantId: z.string(), actorId: z.string(), sessionId: z.string(),
  sourceGrant: z.string(), inventory: z.unknown(), targetHash: z.string(), policyHash: z.string(), planHash: z.string(), expiresAt: z.number() });
export type TransferPlan = Omit<z.infer<typeof planSchema>, "inventory"> & { inventory: ReturnType<typeof validateInventory> };
type Actor = { actorId: string; sessionId: string };
type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function readBoundedBytes(response: Response, max: number): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length") || 0) > max || !response.body) fail("TRANSFER_LIMIT_EXCEEDED");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > max) fail("TRANSFER_LIMIT_EXCEEDED"); parts.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const result = new Uint8Array(length); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
export async function remoteJson(response: Response) { return JSON.parse(new TextDecoder().decode(await readBoundedBytes(response, 2 * 1024 * 1024))) as Record<string, unknown>; }
export async function grantFrom(config: TransferConfig, peerId: string, sourceGrant: string) {
  const peer = peerFor(config, peerId, "source");
  const token = await openLocal(config, sourceGrant);
  const grant = await verifyToken(config, peer, token, "source-grant");
  if (typeof grant.grantId !== "string" || typeof grant.closureHash !== "string") fail("GRANT_INVALID");
  return { peer, token, grantId: grant.grantId, closureHash: grant.closureHash };
}
export async function inspectTarget(inventory: TransferPlan["inventory"], tx: typeof db | DatabaseTransaction = db) {
  const snapshot = []; const issues: TransferIssue[] = [];
  for (const artifact of inventory.artifacts) {
    const imports = await tx.select({ id: imporBundle.id, checksum: imporBundle.checksum, status: imporBundle.status, courseId: imporBundle.courseId }).from(imporBundle).where(eq(imporBundle.bundleId, artifact.bundleId));
    if (imports.some(row => row.checksum !== artifact.checksum || ["withdrawn", "discarding", "rejected"].includes(row.status))) issues.push({ code: "IDENTITY_CONFLICT", itemId: artifact.id });
    const [course] = await tx.select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).where(or(eq(mataKuliah.id, artifact.courseId), eq(mataKuliah.legacyCourseId, artifact.courseId))).limit(1);
    const [legacy] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, course?.legacyCourseId ?? artifact.courseId)).limit(1);
    if (!course || !legacy) issues.push({ code: "IDENTITY_COURSE_MAPPING_REQUIRED", itemId: artifact.id });
    if (imports.some(row => row.courseId !== legacy?.id)) issues.push({ code: "IDENTITY_CONFLICT", itemId: artifact.id });
    for (const chapterId of artifact.chapters) {
      const [chapter] = await tx.select({ courseId: bab.mataKuliahId }).from(bab).where(or(eq(bab.id, chapterId), eq(bab.legacyChapterId, chapterId))).limit(1);
      if (!chapter || chapter.courseId !== course?.id) issues.push({ code: "IDENTITY_CHAPTER_MAPPING_REQUIRED", itemId: artifact.id });
    }
    for (const creatorId of artifact.creators) {
      const [creator] = await tx.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, creatorId)).limit(1);
      if (!creator) issues.push({ code: "IDENTITY_CREATOR_MAPPING_REQUIRED", itemId: artifact.id });
    }
    snapshot.push({ id: artifact.id, imports });
    for (const entity of artifact.entities) {
      if (entity.type === "idea") {
        const [row] = await tx.select({ version: ide.version, hash: ide.semanticHash, courseId: ide.mataKuliahId, status: ide.status }).from(ide).where(eq(ide.id, entity.id)).limit(1);
        if (row && (row.version !== entity.version || row.hash !== entity.hash || row.courseId !== course?.id || row.status === "withdrawn")) issues.push({ code: "IDENTITY_CONFLICT", itemId: artifact.id });
      }
      if (entity.type === "source_material") {
        const [row] = await tx.select({ version: sumberMateri.version, hash: sumberMateri.checksum, courseId: sumberMateri.mataKuliahId, status: sumberMateri.status }).from(sumberMateri).where(eq(sumberMateri.id, entity.id)).limit(1);
        if (row && (row.version !== entity.version || row.hash !== entity.hash || row.courseId !== course?.id || row.status !== "active")) issues.push({ code: "IDENTITY_CONFLICT", itemId: artifact.id });
      }
      if (entity.type === "source_chunk") {
        const [row] = await tx.select({ version: potonganSumber.sourceVersion, hash: potonganSumber.checksum, courseId: sumberMateri.mataKuliahId }).from(potonganSumber)
          .innerJoin(sumberMateri, eq(sumberMateri.id, potonganSumber.sumberMateriId)).where(eq(potonganSumber.id, entity.id)).limit(1);
        if (row && (row.version !== entity.version || row.hash !== entity.hash || row.courseId !== course?.id)) issues.push({ code: "IDENTITY_CONFLICT", itemId: artifact.id });
      }
      if (entity.type === "learning_section") {
        const [row] = await tx.select({ version: bagianPembelajaran.version, courseId: bagianPembelajaran.mataKuliahId, status: bagianPembelajaran.status }).from(bagianPembelajaran).where(eq(bagianPembelajaran.id, entity.id)).limit(1);
        if (row && (row.version !== entity.version || row.courseId !== course?.id || row.status !== "published")) issues.push({ code: "IDENTITY_CONFLICT", itemId: artifact.id });
      }
      if (entity.type === "product") {
        for (const table of [artikel, diktatMateri, setFlashcard] as const) {
          const [row] = await tx.select({ version: table.version, hash: table.generationHash, status: table.status, courseId: table.mataKuliahId }).from(table).where(eq(table.id, entity.id)).limit(1);
          if (row && (row.version !== entity.version || row.hash !== entity.hash || row.courseId !== course?.id || ["withdrawn", "retired"].includes(row.status))) issues.push({ code: "IDENTITY_CONFLICT", itemId: artifact.id });
        }
        const [card] = await tx.select({ version: flashcard.version, hash: flashcard.generationHash, status: flashcard.status, courseId: setFlashcard.mataKuliahId }).from(flashcard)
          .innerJoin(setFlashcard, eq(setFlashcard.id, flashcard.setFlashcardId)).where(eq(flashcard.id, entity.id)).limit(1);
        if (card && (card.version !== entity.version || card.hash !== entity.hash || card.courseId !== course?.id || card.status === "retired")) issues.push({ code: "IDENTITY_CONFLICT", itemId: artifact.id });
      }
    }
  }
  return { hash: sha256(stableJson(snapshot)), issues, snapshot };
}
export async function planTransfer(config: TransferConfig, actor: Actor, input: unknown) {
  await requireTransferActor(actor.actorId, actor.sessionId);
  const parsed = planInputSchema.parse(input);
  const grant = await grantFrom(config, parsed.sourcePeerId, parsed.sourceGrant);
  const response = await remoteJson(await peerRequest(config, grant.peer, "inspect", { grantToken: grant.token }));
  if (typeof response.token !== "string") fail("PEER_RESPONSE_INVALID");
  const remote = await verifyToken(config, grant.peer, response.token, "inventory");
  const expected = capabilities(config);
  if (remote.databaseFingerprint !== grant.peer.databaseFingerprint || remote.storageFingerprint !== grant.peer.storageFingerprint ||
    remote.databaseFingerprint === expected.databaseFingerprint || remote.storageFingerprint === expected.storageFingerprint) fail("PEER_RESOURCE_COLLISION");
  const inventory = validateInventory(remote.inventory);
  if (inventory.artifacts.some(a => !expected.schemas.includes(a.schemaVersion))) fail("TRANSFER_SCHEMA_UNSUPPORTED");
  if (inventory.artifacts.some(a => a.attributionActorId && a.attributionActorId !== actor.actorId)) fail("IDENTITY_ATTRIBUTION_MAPPING_REQUIRED");
  if (inventory.closureHash !== grant.closureHash) fail("CHECKSUM_MISMATCH");
  const target = await inspectTarget(inventory);
  const content = { ...actor, sourcePeerId: parsed.sourcePeerId, grantId: grant.grantId, sourceGrant: parsed.sourceGrant,
    inventory, targetHash: target.hash, policyHash: sha256(stableJson(capabilities(config))), expiresAt: deadlineInSeconds(900) };
  const planHash = sha256(stableJson(content));
  const planToken = target.issues.length ? null : await signToken(config, "transfer-plan", config.identity.id, { plan: { ...content, planHash } }, 900);
  if (planToken && planToken.length > 128000) fail("TRANSFER_LIMIT_EXCEEDED");
  return { planHash, expiresAt: content.expiresAt, sourceEnvironment: parsed.sourcePeerId, targetEnvironment: config.identity.id,
    mode: "draft_only", compatible: target.issues.length === 0, issues: target.issues, rootId: inventory.rootId,
    artifacts: inventory.artifacts.map(a => ({ id: a.id, kind: a.kind, bundleId: a.bundleId, checksum: a.checksum, byteLength: a.byteLength,
      action: target.snapshot.find(s => s.id === a.id)?.imports.length ? "reuse" : "copy" })),
    planToken };
}
function parsePlan(value: unknown): TransferPlan { const plan = planSchema.parse(value); return { ...plan, inventory: validateInventory(plan.inventory) }; }
export async function executeTransfer(config: TransferConfig, actor: Actor, input: unknown) {
  await requireTransferActor(actor.actorId, actor.sessionId);
  const parsed = executeInputSchema.parse(input);
  // The token hash can be checked for retries even after the short planning token expires.
  const requestHash = sha256(parsed.planToken);
  const [existing] = await db.select().from(authoringTransfer).where(and(eq(authoringTransfer.actorId, actor.actorId), eq(authoringTransfer.idempotencyKey, parsed.idempotencyKey))).limit(1);
  if (existing) {
    if (existing.requestHash !== requestHash) fail("TRANSFER_IDEMPOTENCY_CONFLICT");
    return transferStatus(existing.id, actor);
  }
  const claims = await verifyToken(config, null, parsed.planToken, "transfer-plan");
  const plan = parsePlan(claims.plan);
  if (plan.actorId !== actor.actorId || plan.sessionId !== actor.sessionId || plan.expiresAt <= Date.now()) fail("PLAN_STALE");
  if (plan.policyHash !== sha256(stableJson(capabilities(config)))) fail("PLAN_STALE");
  const { planHash: _hash, ...content } = plan;
  if (sha256(stableJson(content)) !== plan.planHash) fail("PLAN_STALE");
  await grantFrom(config, plan.sourcePeerId, plan.sourceGrant);
  const id = `transfer-${randomUUID()}`;
  try { await db.transaction(async tx => {
    const target = await inspectTarget(plan.inventory, tx);
    if (target.hash !== plan.targetHash || target.issues.length) fail("PLAN_STALE");
    await tx.insert(authoringTransfer).values({ id, ...actor, sourcePeerId: plan.sourcePeerId, idempotencyKey: parsed.idempotencyKey, requestHash, planHash: plan.planHash,
      plan: { ...plan, sourceGrant: undefined } as unknown as Record<string, unknown>, sealedGrant: plan.sourceGrant, expiresAt: deadlineInSeconds(86400) });
    for (const artifact of plan.inventory.artifacts) await tx.insert(authoringTransferItem).values({ transferId: id, artifactId: artifact.id,
      descriptor: artifact as unknown as Record<string, unknown>, quarantineKey: buildTransferArtifactKey(id, artifact.byteHash) });
    await tx.insert(authoringTransferOutbox).values({ id: `${id}-0`, transferId: id });
    await auditTransfer(actor.actorId, id, "transfer_requested", { sourcePeerId: plan.sourcePeerId, planHash: plan.planHash, closureHash: plan.inventory.closureHash, mode: "draft_only" }, tx);
  }); } catch (error) {
    const [raced] = await db.select().from(authoringTransfer).where(and(eq(authoringTransfer.actorId, actor.actorId), eq(authoringTransfer.idempotencyKey, parsed.idempotencyKey))).limit(1);
    if (raced) {
      if (raced.requestHash !== requestHash) fail("TRANSFER_IDEMPOTENCY_CONFLICT");
      return transferStatus(raced.id, actor);
    }
    throw error;
  }
  return transferStatus(id, actor);
}
export async function transferStatus(id: string, actor: Actor) {
  await requireTransferActor(actor.actorId, actor.sessionId);
  const [row] = await db.select().from(authoringTransfer).where(and(eq(authoringTransfer.id, id), eq(authoringTransfer.actorId, actor.actorId))).limit(1);
  if (!row) fail("TRANSFER_NOT_FOUND");
  const items = await db.select({ artifactId: authoringTransferItem.artifactId, state: authoringTransferItem.state, targetImportId: authoringTransferItem.targetImportId, owned: authoringTransferItem.owned })
    .from(authoringTransferItem).where(eq(authoringTransferItem.transferId, id));
  return { transferId: id, sourceEnvironment: row.sourcePeerId, state: row.state, reasonCode: row.reasonCode, items,
    transportComplete: items.every(i => i.state !== "pending"), draftMaterialized: row.state === "completed", receipt: row.receipt,
    retryAfterSeconds: ["queued", "running", "retry_wait"].includes(row.state) ? 10 : null };
}
export async function controlTransfer(config: TransferConfig, id: string, actor: Actor, action: "resume" | "cancel", sourceGrant?: string) {
  await requireTransferActor(actor.actorId, actor.sessionId);
  const renewed = sourceGrant ? await grantFrom(config, (await transferStatus(id, actor)).sourceEnvironment, sourceGrant) : null;
  await db.transaction(async tx => {
    const [row] = await tx.select().from(authoringTransfer).where(and(eq(authoringTransfer.id, id), eq(authoringTransfer.actorId, actor.actorId))).limit(1);
    if (!row) fail("TRANSFER_NOT_FOUND");
    if (["completed", "cancelled"].includes(row.state)) return;
    if (action === "resume") {
      if (row.sealedGrant === CLEANUP_CLAIM) fail("TRANSFER_REPLAN_REQUIRED");
      if (row.expiresAt < deadlineInSeconds(-7 * 86400)) fail("TRANSFER_REPLAN_REQUIRED");
      if (row.expiresAt <= Date.now() && !renewed) fail("GRANT_EXPIRED");
      if (renewed && renewed.closureHash !== validateInventory(row.plan.inventory).closureHash) fail("PLAN_STALE");
      peerFor(config, row.sourcePeerId, "source");
      if (row.state === "running" && row.leaseUntil > Date.now()) fail("TRANSFER_BUSY");
    }
    const version = row.stateVersion + 1;
    const updated = await tx.update(authoringTransfer).set({ state: action === "cancel" ? "cancelled" : "queued", stateVersion: version,
      leaseUntil: 0, reasonCode: null, nextAttemptAt: 0,
      ...(action === "resume" ? { sessionId: actor.sessionId } : {}),
      ...(renewed ? { sealedGrant: sourceGrant!, expiresAt: deadlineInSeconds(86400), attempts: 0 } : {}),
    }).where(and(eq(authoringTransfer.id, id), eq(authoringTransfer.stateVersion, row.stateVersion))).returning({ id: authoringTransfer.id });
    if (!updated.length) fail("TRANSFER_BUSY");
    if (action === "resume") await tx.insert(authoringTransferOutbox).values({ id: `${id}-${version}`, transferId: id });
    await auditTransfer(actor.actorId, id, `transfer_${action}`, { stateVersion: version }, tx);
  });
  return transferStatus(id, actor);
}
