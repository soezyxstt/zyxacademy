import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { workerTarget, assertWorkerEnvironment } from "./worker-targets.mjs";
import { assertCanonicalDimensions, CANONICAL_VECTOR_PROFILE, parseVersionedVectorId, type CanonicalVectorRecord } from "../../lib/vectorize/contracts";
import type { AdminKnowledgeChunk } from "../../lib/admin-ops-ai/admin-knowledge-contracts";
import { readRemainingRun } from "./smoke-remaining-workers";

export function adminKnowledgeSmokeArguments(args: string[]) {
  const target = workerTarget(args[0]);
  assert.equal(target.name, "production", "ADMIN_KNOWLEDGE_SMOKE_PRODUCTION_REQUIRED");
  assert.ok(args.length === 1 || (args.length === 2 && args[1] === "--dry-run"), "ADMIN_KNOWLEDGE_SMOKE_ARGUMENTS_INVALID");
  return { target, dryRunOnly: args[1] === "--dry-run" };
}

export function assertAdminKnowledgeVector(chunk: AdminKnowledgeChunk, vector?: CanonicalVectorRecord) {
  assert.ok(vector, "ADMIN_KNOWLEDGE_VECTOR_MISSING");
  assert.equal(vector.id, chunk.vectorId, "ADMIN_KNOWLEDGE_VECTOR_ID_MISMATCH");
  assertCanonicalDimensions(vector.values, "Admin knowledge acceptance vector");
  const parsed = parseVersionedVectorId(chunk.vectorId);
  for (const [key, value] of Object.entries({
    namespace: "admin_ops_knowledge", entityType: "admin_document", entityId: parsed.entityId,
    version: chunk.version, status: "active", accessClass: "admin", language: "id",
    profileId: CANONICAL_VECTOR_PROFILE.id, contentHash: chunk.contentHash,
  })) assert.equal(vector.metadata[key as keyof typeof vector.metadata], value, "ADMIN_KNOWLEDGE_VECTOR_METADATA_MISMATCH");
}

async function main() {
  const { target, dryRunOnly } = adminKnowledgeSmokeArguments(process.argv.slice(2));
  const config = JSON.parse(await readFile(`${target.output}/.env.production.json`, "utf8"));
  assertWorkerEnvironment(target, config);
  assert.equal(config.INNGEST_SERVE_ORIGIN, target.origin);
  assert.equal(config.VECTORIZE_WORKER_URL, "https://zyx-vector-api-background.16922204.workers.dev");
  assert.ok(config.INNGEST_SIGNING_KEY && config.INNGEST_EVENT_KEY && config.VECTORIZE_SHARED_SECRET, "ADMIN_KNOWLEDGE_CREDENTIALS_REQUIRED");
  Object.assign(process.env, config);
  const [{ pool }, sourceLoader, chunker, catalog, sync, vectorClient] = await Promise.all([
    import("../../lib/db"), import("../../lib/admin-ops-ai/admin-knowledge-sources"),
    import("../../lib/admin-ops-ai/admin-knowledge-chunker"), import("../../lib/admin-ops-ai/admin-knowledge-store"),
    import("../../lib/admin-ops-ai/admin-knowledge-sync"), import("../../lib/vectorize-client"),
  ]);
  const functionId = "admin-ops-knowledge-sync-worker";
  const fixtureId = `neon-admin-knowledge-${randomUUID()}`;
  const report: Record<string, unknown> = { fixtureId, dryRunOnly, accepted: false, stage: "preflight", functionId };
  const save = () => writeFile(`${target.output}/admin-knowledge-smoke.json`, JSON.stringify(report, null, 2));
  const pause = () => new Promise(resolve => setTimeout(resolve, 3000));
  async function api(path: string, init: RequestInit = {}, allowMissing = false) {
    const response = await fetch(`https://api.inngest.com/v2${path}`, { ...init,
      headers: { Authorization: `Bearer ${config.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": config.INNGEST_ENV, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (allowMissing && response.status === 404) return undefined;
    assert.ok(response.ok, `ADMIN_KNOWLEDGE_INNGEST_HTTP_${response.status}`);
    return response.json();
  }
  try {
    assert.equal((await pool.query("SELECT current_database() AS name")).rows[0].name, "neondb");
    const environments = await api("/envs?limit=250");
    assert.equal(environments.data?.length, 1, "ADMIN_KNOWLEDGE_INNGEST_ENVIRONMENT_COUNT");
    assert.equal(environments.data[0].id, target.inngestEnvironment, "ADMIN_KNOWLEDGE_INNGEST_ENVIRONMENT_MISMATCH");
    const eventKeys = await api("/keys/events?limit=100");
    assert.ok(eventKeys.data?.some((key: { key: string }) => key.key === config.INNGEST_EVENT_KEY), "ADMIN_KNOWLEDGE_EVENT_KEY_MISMATCH");
    const health = await fetch(`${target.origin}/health`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    assert.equal(health.status, 200, "ADMIN_KNOWLEDGE_HEALTH_FAILED");
    const worker = await health.json();
    assert.equal(worker.functions, 22, "ADMIN_KNOWLEDGE_FUNCTION_COUNT_MISMATCH");
    assert.match(config.ZYX_COMPUTE_REVISION, /^[a-f0-9]{64}$/);
    assert.equal(worker.version, config.ZYX_COMPUTE_REVISION, "ADMIN_KNOWLEDGE_REVISION_MISMATCH");

    const sources = await sourceLoader.loadAllCuratedAdminKnowledgeSources();
    assert.deepEqual(sources.map(source => source.id).sort(), sourceLoader.CURATED_ADMIN_KNOWLEDGE_ALLOWLIST.map(source => source.id).sort(), "ADMIN_KNOWLEDGE_ALLOWLIST_INCOMPLETE");
    const manifests = sources.map(source => chunker.chunkAdminKnowledgeSource(source));
    const expectedChunks = manifests.flatMap(manifest => manifest.chunks);
    assert.ok(sources.length > 0 && expectedChunks.length > 0, "ADMIN_KNOWLEDGE_EMPTY_MANIFEST");
    const beforeSources = await catalog.listAllKnowledgeSources();
    const beforeChunks = (await Promise.all(beforeSources.map(source => catalog.listChunksForSource(source.id)))).flat();
    // Explicit catalog reads make a database error fail closed instead of looking like an empty catalog.
    const dry = await sync.executeAdminKnowledgeSync({ dryRun: true, customSources: sources, existingSources: beforeSources, existingChunks: beforeChunks });
    const expectedIds = new Set(expectedChunks.map(chunk => chunk.vectorId));
    for (const operation of dry.operations.filter(operation => operation.action === "delete")) {
      assert.equal(parseVersionedVectorId(operation.vectorId).entityType, "admin_document", "ADMIN_KNOWLEDGE_FOREIGN_DELETE");
      assert.ok(!expectedIds.has(operation.vectorId), "ADMIN_KNOWLEDGE_CURRENT_VECTOR_DELETE");
    }
    report.stage = "dry-run-complete";
    report.workerRevision = worker.version;
    report.plan = { sources: dry.sources, chunks: dry.chunks, manifestHash: dry.manifestHash };
    report.curatedManifestHash = createHash("sha256").update(JSON.stringify(manifests.map(manifest => [manifest.sourceId, manifest.manifestHash]))).digest("hex");
    await save();
    console.log(JSON.stringify({ stage: report.stage, sources: dry.sources, chunks: dry.chunks }));
    if (dryRunOnly) return;

    // Only the normal curated sync worker performs catalog/vector writes or archives obsolete sources.
    const invocation = await api(`/apps/zyx-academy/functions/${functionId}/invoke`, {
      method: "POST", body: JSON.stringify({ data: {}, idempotencyKey: fixtureId }),
    });
    assert.equal(typeof invocation.data?.runId, "string", "ADMIN_KNOWLEDGE_RUN_MISSING");
    const runId = invocation.data.runId as string;
    report.runId = runId;
    report.stage = "worker-running";
    await save();
    let completed = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      const execution = await readRemainingRun(path => api(path, {}, true), functionId, runId);
      if (!execution) { await pause(); continue; }
      assert.equal(execution?.function?.id, functionId, "ADMIN_KNOWLEDGE_RUN_FUNCTION_MISMATCH");
      const status = String(execution.status).toUpperCase();
      if (["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"].includes(status)) {
        report.status = status;
        await save();
        assert.equal(status, "COMPLETED", "ADMIN_KNOWLEDGE_RUN_NOT_COMPLETED");
        const output = typeof execution.output === "string" ? JSON.parse(execution.output) : execution.output;
        assert.equal(output?.success, true, "ADMIN_KNOWLEDGE_WORKER_NOT_SUCCESSFUL");
        assert.equal(output.sourcesTotal, manifests.length, "ADMIN_KNOWLEDGE_WORKER_SOURCE_COUNT_MISMATCH");
        assert.equal(output.chunksTotal, expectedChunks.length, "ADMIN_KNOWLEDGE_WORKER_CHUNK_COUNT_MISMATCH");
        completed = true;
        break;
      }
      await pause();
    }
    assert.ok(completed, "ADMIN_KNOWLEDGE_RUN_PENDING");
    report.stage = "verify-catalog-and-vectors";
    await save();
    const activeSources = (await catalog.listAllKnowledgeSources()).filter(source => source.status === "active");
    assert.deepEqual(activeSources.map(source => source.id).sort(), manifests.map(manifest => manifest.sourceId).sort(), "ADMIN_KNOWLEDGE_CATALOG_SOURCE_SET_MISMATCH");
    const activeChunks = (await Promise.all(activeSources.map(source => catalog.listChunksForSource(source.id)))).flat().filter(chunk => chunk.status === "active");
    assert.deepEqual(activeChunks.map(chunk => chunk.id).sort(), expectedChunks.map(chunk => chunk.id).sort(), "ADMIN_KNOWLEDGE_CATALOG_CHUNK_SET_MISMATCH");
    for (const manifest of manifests) {
      const source = activeSources.find(source => source.id === manifest.sourceId)!;
      for (const key of ["sourcePath", "version", "contentHash", "manifestHash", "chunkCount"] as const) assert.equal(source[key], manifest[key], "ADMIN_KNOWLEDGE_CATALOG_SOURCE_MISMATCH");
    }
    for (const expected of expectedChunks) {
      const chunk = activeChunks.find(chunk => chunk.id === expected.id)!;
      for (const key of ["sourceId", "chunkIndex", "locator", "content", "contentHash", "version", "vectorId"] as const) assert.equal(chunk[key], expected[key], "ADMIN_KNOWLEDGE_CATALOG_CHUNK_MISMATCH");
    }
    const boundedFetch: typeof fetch = Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }), { preconnect: fetch.preconnect });
    const vectors = vectorClient.createCanonicalVectorClient({ fetcher: boundedFetch });
    for (let offset = 0; offset < expectedChunks.length; offset += 20) {
      const batch = expectedChunks.slice(offset, offset + 20);
      let verified = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const found = await vectors.get({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: batch.map(chunk => chunk.vectorId) });
        try {
          assert.equal(found.vectors.length, batch.length, "ADMIN_KNOWLEDGE_VECTOR_COUNT_MISMATCH");
          for (const chunk of batch) assertAdminKnowledgeVector(chunk, found.vectors.find(vector => vector.id === chunk.vectorId));
          verified = true;
          break;
        } catch (error) {
          if (attempt === 29) throw error;
          await pause();
        }
      }
      assert.ok(verified, "ADMIN_KNOWLEDGE_VECTORS_PENDING");
    }
    const listed = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await vectors.list({ profileId: CANONICAL_VECTOR_PROFILE.id, prefix: "v2:admin_document:", limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const id of page.ids) assert.ok(!listed.has(id) && listed.add(id), "ADMIN_KNOWLEDGE_DUPLICATE_VECTOR_PAGE");
      assert.ok(!page.isTruncated || page.nextCursor, "ADMIN_KNOWLEDGE_VECTOR_CURSOR_MISSING");
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual([...listed].sort(), [...expectedIds].sort(), "ADMIN_KNOWLEDGE_NAMESPACE_VECTOR_SET_MISMATCH");
    report.accepted = true;
    report.stage = "complete";
    report.verifiedSources = activeSources.length;
    report.verifiedChunks = activeChunks.length;
    report.verifiedVectors = listed.size;
    await save();
    console.log(JSON.stringify({ fixtureId, runId, accepted: true, sources: activeSources.length, chunks: activeChunks.length, vectors: listed.size }));
  } finally { await pool.end(); }
}

if (import.meta.main) main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message.split("\n")[0] : "";
  const code = /^[A-Z][A-Z0-9_]+$/.test(message) ? message : "PRIVATE_DIAGNOSTIC_REQUIRED";
  console.error(`ADMIN_KNOWLEDGE_SMOKE_FAILED:${code}; inspect the sanitized acceptance report`);
  process.exitCode = 1;
});
