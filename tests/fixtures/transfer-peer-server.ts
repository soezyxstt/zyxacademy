import { processTransfer } from "@/lib/authoring/transfer/execution";
/** Synthetic peer process for HTTP integration tests. This script is never registered as an application route. */
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { storage } from "@/lib/storage";
import { deadlineInSeconds } from "@/lib/date-utils";
import { createSourceGrant, revokeSourceGrant } from "@/lib/authoring/transfer/source";
import { controlTransfer, executeTransfer, planTransfer, transferStatus } from "@/lib/authoring/transfer/destination";
import { internalTransfer, transferError } from "@/lib/authoring/transfer/http";
import { transferConfig } from "@/lib/authoring/transfer/security";
import { describeBundle } from "@/lib/authoring/transfer/bundles";
import { stageIdeaBundle } from "@/lib/bundle/staging";
import { stageProductBundle } from "@/lib/bundle/product-staging";
import { validateIdeaBundleZip, serializeDeterministically } from "@/lib/bundle/idea-bundle-v2";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { sha256 } from "@/lib/authoring/transfer/contracts";
import { cleanupTransfers } from "@/lib/authoring/transfer/cleanup";
import { ideaTransferFixture, productTransferFixture } from "./transfer-bundles";

if (process.env.NODE_ENV !== "test" || !process.env.TRANSFER_TEST_CONFIG) throw new Error("TEST_ONLY");
const fixture = JSON.parse(readFileSync(process.env.TRANSFER_TEST_CONFIG, "utf8")) as { identity: unknown; peers: unknown; readyFile: string; sourceUrl?: string; seed: boolean };
process.env.AUTHORING_TRANSFER_IDENTITY = JSON.stringify(fixture.identity);
process.env.AUTHORING_TRANSFER_PEERS = JSON.stringify(fixture.peers);
const config = transferConfig();
const realFetch = globalThis.fetch;
let remoteUrl = fixture.sourceUrl;
let fault = "";
{
  const fetchWithPeerMapping = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/artifact") && fault === "unavailable-once") { fault = ""; return Promise.resolve(new Response("", { status: 503, headers: { "retry-after": "1" } })); }
    if (url.endsWith("/artifact") && fault === "corrupt-once") { fault = ""; return Promise.resolve(new Response(new Uint8Array([1, 2, 3]))); }
    const peerOrigin = config.peers[0].origin;
    return realFetch(remoteUrl && url.startsWith(`${peerOrigin}/`) ? url.replace(peerOrigin, remoteUrl) : input, init);
  }) as typeof fetch;
  globalThis.fetch = fetchWithPeerMapping;
}
const files = new Map<string, Uint8Array>();
Object.assign(storage, {
  exists: async (key: string) => files.has(key),
  download: async (key: string) => { const bytes = files.get(key); if (!bytes) throw new Error("SOURCE_ARTIFACT_UNAVAILABLE"); return bytes; },
  upload: async (bytes: Uint8Array, _name: string, _mime: string, options: { key: string }) => { files.set(options.key, bytes); return { key: options.key, url: "", size: bytes.length }; },
  delete: async (key: string) => { files.delete(key); },
});
const actor = { actorId: "creator-1", sessionId: "transfer-test-session" };
await db.insert(schema.user).values({ id: actor.actorId, name: "Fixture admin", email: "transfer@example.invalid", role: "admin" }).onConflictDoNothing();
await db.insert(schema.pengguna).values({ id: actor.actorId }).onConflictDoNothing();
await db.insert(schema.user).values({ id: "curator-1", name: "Fixture curator", email: "curator@example.invalid", role: "admin" }).onConflictDoNothing();
await db.insert(schema.pengguna).values({ id: "curator-1" }).onConflictDoNothing();
await db.insert(schema.peran).values({ id: "transfer-test-admin", code: "admin" }).onConflictDoNothing();
await db.insert(schema.penggunaPeran).values({ id: "transfer-membership", penggunaId: actor.actorId, peranId: "transfer-test-admin", source: "fixture" }).onConflictDoNothing();
await db.insert(schema.session).values({ id: actor.sessionId, token: "synthetic-test-session", userId: actor.actorId, expiresAt: new Date(deadlineInSeconds(86400)) }).onConflictDoNothing();
await db.insert(schema.courses).values({ id: "course-physics", title: "Physics", category: "Fisika", description: "Fixture" }).onConflictDoNothing();
await db.insert(schema.mataKuliah).values({ id: "course-physics", code: "PHYS", title: "Physics", legacyCourseId: "course-physics" }).onConflictDoNothing();
await db.insert(schema.bab).values({ id: "chapter-kinematics", mataKuliahId: "course-physics", code: "KIN", title: "Kinematics", orderIndex: 0 }).onConflictDoNothing();
const ideaBytes = ideaTransferFixture();
const parsedIdea = validateIdeaBundleZip(ideaBytes); if (!parsedIdea.success) throw new Error("FIXTURE_INVALID");
let root: ReturnType<typeof describeBundle> | undefined;
if (fixture.seed) {
  const idea = parsedIdea.data;
  const items = [
    ...idea.entities.sourceMaterials.map(e => ({ entityType: "source_material", entityId: e.id, entityVersion: e.version, entityHash: sha256(serializeDeterministically(e)) })),
    ...idea.entities.sourceChunks.map(e => ({ entityType: "source_chunk", entityId: e.id, entityVersion: e.sourceVersion, entityHash: sha256(serializeDeterministically(e)) })),
    ...idea.entities.ideas.map(e => ({ entityType: "idea", entityId: e.id, entityVersion: e.version, entityHash: sha256(serializeDeterministically(e)) })),
  ];
  await stageIdeaBundle({ runId: "fixture-source", bundleId: idea.manifest.bundleId, courseId: idea.manifest.courseId, schemaVersion: 3, checksum: idea.manifest.bundleChecksum, bytes: ideaBytes, requestedBy: actor.actorId,
    items, validationReport: { valid: true, reasonCodes: [], fileCount: 8, entityCount: items.length, sourceCount: 1, relationCount: 0, warnings: [] } });
  const bytes = productTransferFixture();
  const product = validateProductBundle(bytes); if (!product.success) throw new Error("FIXTURE_INVALID");
  const staged = await stageProductBundle({ runId: "fixture-source", bundleId: product.data.manifest.bundleId, courseId: "course-physics", checksum: product.data.manifest.bundleChecksum, bytes, requestedBy: actor.actorId, bundle: product.data });
  root = describeBundle(staged.importId, "product", bytes);
}
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
  try {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/internal/transfers/")) return internalTransfer(request, path.split("/").at(-1)!);
    const input = await request.json() as Record<string, unknown>;
    if (path === "/grant") return Response.json(await createSourceGrant(config, actor, input));
    if (path === "/peer-url") { remoteUrl = input.url as string; return Response.json({ updated: true }); }
    if (path === "/fault") {
      fault = input.fault as string;
      if (fault === "checkpoint-write") await db.run(sql`CREATE TRIGGER transfer_test_checkpoint BEFORE UPDATE OF state ON authoring_transfer_item WHEN NEW.state = 'materialized' BEGIN SELECT RAISE(ABORT, 'fixture-checkpoint-failure'); END`);
      if (fault === "clear-checkpoint") await db.run(sql`DROP TRIGGER IF EXISTS transfer_test_checkpoint`);
      return Response.json({ configured: true });
    }
    if (path === "/counts") return Response.json({ imports: (await db.select({ id: schema.imporBundle.id }).from(schema.imporBundle)).length });
    if (path === "/expire-ledger") {
      await db.update(schema.authoringTransfer).set({ expiresAt: deadlineInSeconds(-91 * 86400) });
      await db.update(schema.authoringTransferGrant).set({ expiresAt: deadlineInSeconds(-91 * 86400) });
      return Response.json({ aged: true });
    }
    if (path === "/cleanup") {
      const counts = await cleanupTransfers();
      return Response.json({ ...counts, transferObjects: [...files.keys()].filter(key => key.startsWith("overhaul/transfers/")).length,
        bundleObjects: [...files.keys()].filter(key => !key.startsWith("overhaul/transfers/")).length,
        imports: (await db.select({ id: schema.imporBundle.id }).from(schema.imporBundle)).length });
    }
    if (path === "/revoke") return Response.json(await revokeSourceGrant(input.grantId as string, actor));
    if (path === "/plan") return Response.json(await planTransfer(config, actor, input));
    if (path === "/execute") return Response.json(await executeTransfer(config, actor, input));
    if (path === "/process") { await processTransfer(config, input.transferId as string); return Response.json(await transferStatus(input.transferId as string, actor)); }
    if (path === "/status") return Response.json(await transferStatus(input.transferId as string, actor));
    if (path === "/cancel" || path === "/resume") return Response.json(await controlTransfer(config, input.transferId as string, actor, path === "/cancel" ? "cancel" : "resume", input.sourceGrant as string | undefined));
    if (path === "/expire-one") {
      await db.update(schema.authoringTransfer).set({ expiresAt: deadlineInSeconds(-60) }).where(eq(schema.authoringTransfer.id, input.transferId as string));
      return Response.json({ expired: true });
    }
    if (path === "/session") {
      await db.update(schema.session).set({ expiresAt: new Date(deadlineInSeconds(input.active ? 86400 : -60)) }).where(eq(schema.session.id, actor.sessionId));
      return Response.json({ active: Boolean(input.active) });
    }
    if (path === "/publish-prerequisites") {
      // Deterministic canonical fixture state, no external publication or vector side effects.
      const e = parsedIdea.data.entities;
      for (const source of e.sourceMaterials) await db.insert(schema.sumberMateri).values({ id: source.id, mataKuliahId: "course-physics", babId: "chapter-kinematics", sourceType: source.sourceType, title: source.title,
        canonicalUriOrR2Key: "fixture-source", checksum: source.checksum, version: source.version, status: "active", creatorId: actor.actorId }).onConflictDoNothing();
      for (const chunk of e.sourceChunks) await db.insert(schema.potonganSumber).values({ id: chunk.id, sumberMateriId: chunk.sourceMaterialId, sourceVersion: chunk.sourceVersion, content: chunk.content, startOffset: chunk.startOffset, endOffset: chunk.endOffset, checksum: chunk.checksum }).onConflictDoNothing();
      for (const idea of e.ideas) await db.insert(schema.ide).values({ id: idea.id, mataKuliahId: idea.courseId, babId: idea.chapterId, stableKey: idea.stableKey, code: idea.code, canonicalStatement: idea.canonicalStatement, conciseExplanation: idea.conciseExplanation,
        knowledgeKind: idea.knowledgeKind, instructionalRole: idea.instructionalRole, version: idea.version, status: "published", schemaVersion: idea.schemaVersion, semanticHash: idea.semanticHash, generationHash: idea.generationHash, sourcePolicy: idea.sourcePolicy, creatorId: actor.actorId }).onConflictDoNothing();
      return Response.json({ ready: true });
    }
    if (path === "/conflict") { await db.update(schema.imporBundle).set({ checksum: "f".repeat(64) }).where(eq(schema.imporBundle.bundleId, "transfer-motion-v3")); return Response.json({ changed: true }); }
    if (path === "/restore-conflict") {
      const parsed = validateProductBundle(productTransferFixture()); if (!parsed.success) throw new Error("FIXTURE_INVALID");
      await db.update(schema.imporBundle).set({ checksum: parsed.data.manifest.bundleChecksum }).where(eq(schema.imporBundle.bundleId, "transfer-motion-v3")); return Response.json({ restored: true });
    }
    if (path === "/suspend") { await db.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, actor.actorId)); return Response.json({ suspended: true }); }
    return Response.json({ error: "not found" }, { status: 404 });
  } catch (error) { return transferError(error); }
} });
await Bun.write(fixture.readyFile, JSON.stringify({ port: server.port, root }));
