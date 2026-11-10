import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { canonicalOutboxPayload, type CanonicalOutboxRow } from "../../lib/vectorize/outbox";
import type { CanonicalVectorRecord, ProviderNeutralVectorOutbox } from "../../lib/vectorize/contracts";
import { workerTarget, assertWorkerEnvironment } from "./worker-targets.mjs";

type Row = CanonicalOutboxRow & { status: string; attempts: number; leaseId: string | null; updatedAt: string; lastError: string | null };
type Source = { id: string; courseId: string; version: number; status: string; title: string; text: string; chapterId: string | null; eligible: boolean };
type Item = { rows: Row[]; source: Source; outbox: ProviderNeutralVectorOutbox; title: string; reason: string };
type Snapshot = { runId: string; rows: Row[]; items: Item[]; hash: string };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function recoveryItem(row: Row, source: Source): Item {
  const original = canonicalOutboxPayload(row);
  assert.equal(source.courseId, row.courseId, "RECOVERY_COURSE_MISMATCH");
  assert.equal(source.id, original.entityId);
  assert.ok(source.version >= original.version, "RECOVERY_VERSION_REGRESSION");
  const stale = source.version !== original.version;
  const removed = !["published", "active"].includes(source.status) || !source.eligible;
  assert.ok(row.action !== "delete" || removed || stale, "RECOVERY_ACTIVE_DELETE_CONFLICT");
  const reason = stale ? "superseded-version" : removed ? "withdrawn-or-ineligible" : "current-source";
  const payload = row.payload as Record<string, unknown>;
  const outbox = canonicalOutboxPayload({ ...row, action: stale || removed ? "delete" : "upsert", payload: {
    ...payload, text: source.text, title: source.title,
    metadata: { ...(payload.metadata as object), status: source.status, chapterId: source.chapterId },
  } });
  return { rows: [row], source, outbox, title: source.title, reason };
}

export function combineRecoveryItems(items: Item[]): Item[] {
  const grouped = new Map<string, Item>();
  for (const item of items) {
    const previous = grouped.get(item.outbox.vectorId);
    if (previous) {
      assert.deepEqual(previous.outbox, item.outbox, "RECOVERY_CONFLICTING_OPERATIONS");
      previous.rows.push(...item.rows);
    } else grouped.set(item.outbox.vectorId, item);
  }
  return [...grouped.values()].sort((a, b) => a.outbox.vectorId.localeCompare(b.outbox.vectorId));
}

export function matchesRecoveryVector(item: Item, vector?: CanonicalVectorRecord, expected?: CanonicalVectorRecord): boolean {
  if (item.outbox.operation === "delete") return !vector;
  return Boolean(vector && vector.id === item.outbox.vectorId && vector.values.length === 768
    && vector.values.every((value, index) => Number.isFinite(value)
      && (!expected || Math.abs(value - expected.values[index]) <= Math.max(1e-7, Math.abs(expected.values[index]) * 1e-5)))
    && Object.entries(item.outbox.metadata).every(([key, value]) => vector.metadata[key as keyof typeof vector.metadata] === value));
}

export async function runRecoveryBatches(total: number, recover: (offset: number) => Promise<void>) {
  // Overlap visibility waits; one shared embedder still paces every HTTP attempt.
  for (let offset = 0; offset < total; offset += 200) {
    const offsets = [offset, offset + 50, offset + 100, offset + 150].filter(value => value < total);
    const results = await Promise.allSettled(offsets.map(recover));
    const failure = results.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}

async function main() {
  const [phase, runId] = process.argv.slice(2);
  assert.ok(["plan", "apply", "apply-short", "stage-short", "verify"].includes(phase), "RECOVERY_PHASE_REQUIRED");
  assert.match(runId ?? "", /^vector-recovery-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  const target = workerTarget("production");
  const config = JSON.parse(await readFile(`${target.output}/.env.production.json`, "utf8"));
  assertWorkerEnvironment(target, config);
  assert.equal(config.VECTORIZE_WORKER_URL, "https://zyx-vector-api-background.16922204.workers.dev");
  Object.assign(process.env, config);
  const [{ pool }, { storage }, { joinKey }, { createCanonicalVectorClient }, { embedWorkerVectorDocuments }] = await Promise.all([
    import("../../lib/db"), import("../../lib/storage"), import("../../lib/storage/keys"),
    import("../../lib/vectorize-client"), import("../../lib/compute/vector-embeddings"),
  ]);
  const prefix = joinKey("operations", "vector-recovery", runId);
  const key = (leaf: string) => joinKey(prefix, leaf);
  const save = async (leaf: string, value: unknown) => {
    const bytes = Buffer.from(JSON.stringify(value));
    await storage.upload(bytes, leaf, "application/json", { key: key(leaf) });
    assert.ok(storage.download);
    assert.equal(hash(JSON.parse(Buffer.from(await storage.download!(key(leaf))).toString())), hash(value), "RECOVERY_BACKUP_READBACK_FAILED");
  };
  const load = async <T>(leaf: string): Promise<T> => JSON.parse(Buffer.from(await storage.download!(key(leaf))).toString());
  const boundedFetch: typeof fetch = Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }), { preconnect: fetch.preconnect });
  const vectors = createCanonicalVectorClient({ fetcher: boundedFetch });
  const profileId = "canonical-content-v2" as const;
  async function readRows(ids?: string[]): Promise<Row[]> {
    const result = await pool.query(`SELECT id, course_id AS "courseId", ko_id AS "koId", action, namespace, payload, status, attempts,
      lease_id AS "leaseId", updated_at::text AS "updatedAt", last_error AS "lastError"
      FROM vector_sync_queue WHERE ${ids ? "id=ANY($1::text[])" : "status='failed'"} ORDER BY id`, ids ? [ids] : []);
    return result.rows;
  }
  function sourceQuery(namespace: string): string {
    const columns = `x.id, c.legacy_course_id AS "courseId", x.version::int, x.status, x.bab_id AS "chapterId"`;
    let query: string;
    if (namespace === "canonical_ideas") query = `SELECT ${columns}, x.code AS title,
      concat_ws(E'\n\n',nullif(x.canonical_statement,''),nullif(x.concise_explanation,''),CASE WHEN nullif(x.latex,'') IS NOT NULL THEN 'Formula: '||x.latex END) AS text,true AS eligible
      FROM ide x JOIN mata_kuliah c ON c.id=x.mata_kuliah_id WHERE x.id=$1`;
    else if (namespace === "published_articles") query = `SELECT ${columns},x.title,
      regexp_replace(x.content_markdown, '[[:space:]]*<!--__ZYX_V3_ARTICLE_VISUALS__:[A-Za-z0-9_-]+-->[[:space:]]*$', '') AS text,true AS eligible
      FROM artikel x JOIN mata_kuliah c ON c.id=x.mata_kuliah_id WHERE x.id=$1`;
    else {
      assert.equal(namespace, "source_materials", "RECOVERY_UNSUPPORTED_NAMESPACE");
      query = `SELECT x.id,c.legacy_course_id AS "courseId",x.source_version::int AS version,sm.status,sm.bab_id AS "chapterId",
        sm.title,x.content AS text,x.embedding_eligible AS eligible FROM potongan_sumber x
        JOIN sumber_materi sm ON sm.id=x.sumber_materi_id JOIN mata_kuliah c ON c.id=sm.mata_kuliah_id
        WHERE x.id=$1 AND sm.version=x.source_version`;
    }
    return query.replace("x.id=$1", "x.id=ANY($1::text[])");
  }
  async function sourcesFor(rows: Row[]) {
    const sources = new Map<string, Source>();
    for (const namespace of new Set(rows.map(row => row.namespace))) {
      const ids = [...new Set(rows.filter(row => row.namespace === namespace).map(row => canonicalOutboxPayload(row).entityId))];
      const result = await pool.query(sourceQuery(namespace), [ids]);
      assert.equal(result.rowCount, ids.length, "RECOVERY_SOURCE_MISSING");
      for (const source of result.rows) sources.set(`${namespace}:${source.id}`, source);
    }
    return sources;
  }
  async function assertSources(items: Item[]) {
    const sources = await sourcesFor(items.flatMap(item => item.rows));
    for (const item of items) assert.deepEqual(sources.get(`${item.rows[0].namespace}:${item.source.id}`), item.source, "RECOVERY_SOURCE_CHANGED");
  }
  async function inspect(items: Item[], expected?: CanonicalVectorRecord[]) {
    const found = await vectors.get({ profileId, ids: items.map(item => item.outbox.vectorId) });
    const byId = new Map(found.vectors.map(vector => [vector.id, vector]));
    return items.filter(item => !matchesRecoveryVector(item, byId.get(item.outbox.vectorId), expected?.find(vector => vector.id === item.outbox.vectorId)));
  }
  try {
    assert.equal((await pool.query("SELECT current_database() AS name")).rows[0].name, "neondb");
    const health = await fetch(`${target.origin}/health?recovery=${runId}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    assert.equal(health.status, 200);
    const identity = await health.json();
    assert.equal(identity.version, config.ZYX_COMPUTE_REVISION);
    assert.equal(identity.functions, 22);
    const snapshotExists = await storage.exists(key("snapshot.json"));
    if (phase === "plan") {
      assert.equal(snapshotExists, false, "RECOVERY_SNAPSHOT_ALREADY_EXISTS");
      const rows = await readRows();
      assert.equal(rows.length, 2083, "RECOVERY_BACKLOG_COUNT_CHANGED");
      const sources = await sourcesFor(rows);
      const items = rows.map(row => recoveryItem(row, sources.get(`${row.namespace}:${canonicalOutboxPayload(row).entityId}`)!));
      const grouped = combineRecoveryItems(items);
      assert.equal(grouped.length, 2068);
      assert.equal(grouped.filter(item => item.outbox.operation === "upsert").length, 2042);
      const snapshot: Snapshot = { runId, rows, items: grouped, hash: hash({ rows, items: grouped }) };
      await save("snapshot.json", snapshot);
      console.log(JSON.stringify({ phase, runId, rows: rows.length, operations: grouped.length, upserts: 2042, deletes: 26, backupVerified: true }));
      return;
    }
    assert.ok(snapshotExists, "RECOVERY_SNAPSHOT_REQUIRED");
    const snapshot = await load<Snapshot>("snapshot.json");
    assert.equal(snapshot.runId, runId);
    assert.equal(hash({ rows: snapshot.rows, items: snapshot.items }), snapshot.hash);
    if (phase === "apply" || phase === "apply-short" || phase === "stage-short") {
      if (!await storage.exists(key("embedding-canary.json"))) {
        const documents = [{ title: "Addition", content: "Two plus three equals five." }, { title: "Geometry", content: "A triangle has three sides." }];
        const canary = await embedWorkerVectorDocuments(documents);
        assert.equal(canary.length, 2);
        assert.notDeepEqual(canary[0], canary[1]);
        const similarities = [];
        for (let index = 0; index < documents.length; index++) {
          const [singleton] = await embedWorkerVectorDocuments([documents[index]]);
          const vector = canary[index];
          const similarity = vector.reduce((sum, value, position) => sum + value * singleton[position], 0)
            / Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0) * singleton.reduce((sum, value) => sum + value * value, 0));
          assert.ok(similarity > 0.9999, "RECOVERY_EMBEDDING_ORDER_MISMATCH");
          similarities.push(similarity);
        }
        await save("embedding-canary.json", { documents: 2, dimensions: canary.map(value => value.length), distinct: true, singletonOrderSimilarities: similarities });
      }
      async function recoverBatch(offset: number) {
        let batch: Item[] = snapshot.items.slice(offset, offset + 50).filter(item => !phase.endsWith("-short") || Buffer.byteLength(item.outbox.vectorId) <= 64);
        if (!batch.length) return;
        let ids: string[] = batch.flatMap(item => item.rows.map(row => row.id));
        let current = await readRows(ids);
        assert.equal(current.length, ids.length);
        const completed = new Set(current.filter(row => row.status === "completed" && (row.payload as Record<string, any>).vectorizeRecovery?.runId === runId).map(row => row.id));
        batch = batch.filter(item => !item.rows.every(row => completed.has(row.id)));
        if (!batch.length) return;
        ids = batch.flatMap(item => item.rows.map(row => row.id));
        const leaseId = `${runId}-${offset}`;
        // A cancelled maintenance runner may leave its own expired lease behind.
        await pool.query(`UPDATE vector_sync_queue SET status='failed',lease_id=NULL,lease_expires_at=NULL,updated_at=now()
          WHERE id=ANY($1::text[]) AND status='processing' AND lease_id=$2 AND lease_expires_at<now()`, [ids, leaseId]);
        current = await readRows(ids);
        await assertSources(batch);
        for (const row of current) {
          const before = snapshot.rows.find(original => original.id === row.id)!;
          assert.equal(row.status, "failed", "RECOVERY_ROW_NOT_FAILED");
          assert.equal(row.attempts, before.attempts);
          assert.deepEqual(row.payload, before.payload, "RECOVERY_PAYLOAD_CHANGED");
        }
        try {
          console.log(JSON.stringify({ runId, batchOffset: offset, stage: "claim" }));
          const expected = batch.flatMap(item => item.rows.map(row => ({ id: row.id, payload: row.payload, attempts: row.attempts })));
          const claimed = await pool.query(`UPDATE vector_sync_queue q SET status='processing',lease_id=$2,lease_expires_at=now()+interval '10 minutes',updated_at=now()
            FROM jsonb_to_recordset($3::jsonb) AS expected(id text,payload jsonb,attempts int)
            WHERE q.id=ANY($1::text[]) AND q.id=expected.id AND q.status='failed' AND q.payload=expected.payload AND q.attempts=expected.attempts RETURNING q.id`, [ids, leaseId, JSON.stringify(expected)]);
          assert.equal(claimed.rowCount, ids.length, "RECOVERY_LEASE_CONFLICT");
          const missing = await inspect(batch);
          const batchHash = hash(batch);
          const backupLeaf = `before-vectors-${batchHash}.json`;
          if (!await storage.exists(key(backupLeaf))) await save(backupLeaf, await vectors.get({ profileId, ids: batch.map(item => item.outbox.vectorId) }));
          // The title participates in embedding but has no Vectorize metadata hash.
          const upserts = batch.filter(item => item.outbox.operation === "upsert");
          const leaf = `batch-${batchHash}.json`;
          let records: CanonicalVectorRecord[] = [];
          if (await storage.exists(key(leaf))) {
            const cache = await load<{ planHash: string; records: CanonicalVectorRecord[] }>(leaf);
            assert.equal(cache.planHash, hash(batch));
            records = cache.records;
            assert.equal(records.length, upserts.length, "RECOVERY_CACHE_INCOMPLETE");
            for (const record of records) assert.ok(matchesRecoveryVector(batch.find(item => item.outbox.vectorId === record.id)!, record));
          } else {
            const values = upserts.length ? await embedWorkerVectorDocuments(upserts.map(item => ({ title: item.title, content: item.outbox.operation === "upsert" ? item.outbox.content : "" }))) : [];
            records = upserts.map((item, index) => ({ id: item.outbox.vectorId, values: values[index], metadata: item.outbox.operation === "upsert" ? item.outbox.metadata : assert.fail() }));
            await save(leaf, { planHash: hash(batch), records });
          }
          await assertSources(batch);
          const owner = await pool.query("SELECT count(*)::int AS count FROM vector_sync_queue WHERE id=ANY($1::text[]) AND status='processing' AND lease_id=$2 AND lease_expires_at>now()", [ids, leaseId]);
          assert.equal(owner.rows[0].count, ids.length, "RECOVERY_LEASE_LOST");
          const existing = records.length ? await vectors.get({ profileId, ids: records.map(record => record.id) }) : { vectors: [] };
          const changed = records.filter(record => !matchesRecoveryVector(batch.find(item => item.outbox.vectorId === record.id)!, existing.vectors.find(vector => vector.id === record.id), record));
          if (changed.length) await vectors.upsert({ profileId, vectors: changed });
          const deletes = missing.filter(item => item.outbox.operation === "delete").map(item => item.outbox.vectorId);
          if (deletes.length) await vectors.delete({ profileId, ids: deletes });
          if (phase === "stage-short") {
            await save(`staged-${batchHash}.json`, { runId, batchHash, rows: ids, indexWriteAccepted: true, independentlyVerified: false });
            const released = await pool.query(`UPDATE vector_sync_queue SET status='failed',lease_id=NULL,lease_expires_at=NULL,updated_at=now()
              WHERE id=ANY($1::text[]) AND status='processing' AND lease_id=$2 RETURNING id`, [ids, leaseId]);
            assert.equal(released.rowCount, ids.length, "RECOVERY_STAGE_LEASE_LOST");
            console.log(JSON.stringify({ runId, batchOffset: offset, operations: batch.length, stage: "awaiting-independent-readback" }));
            return;
          }
          let remaining = batch;
          for (let attempt = 0; attempt < 90; attempt++) {
            remaining = await inspect(batch, records);
            if (!remaining.length) break;
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          assert.equal(remaining.length, 0, "RECOVERY_VECTOR_READBACK_MISMATCH");
          await assertSources(batch);
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            for (const item of batch) for (const original of item.rows) {
              const payload = { ...(original.payload as object), providerNeutralOutbox: item.outbox,
                vectorizeCompletion: { vectorId: item.outbox.vectorId, profileId, dimensions: 768, indexedContentHash: item.outbox.operation === "upsert" ? item.outbox.metadata.contentHash : null },
                vectorizeRecovery: { runId, snapshotHash: snapshot.hash, effectiveOperation: item.outbox.operation, reason: item.reason,
                  originalAction: original.action, currentSourceHash: hash(item.source), checkpoint: leaf, verified: true } };
              const finalized = await client.query(`UPDATE vector_sync_queue SET status='completed',payload=$3::jsonb,lease_id=NULL,lease_expires_at=NULL,updated_at=now()
                WHERE id=$1 AND status='processing' AND lease_id=$2 AND payload=$4::jsonb RETURNING id`, [original.id, leaseId, JSON.stringify(payload), JSON.stringify(original.payload)]);
              assert.equal(finalized.rowCount, 1, "RECOVERY_FINALIZE_CONFLICT");
            }
            await client.query("COMMIT");
          } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
          console.log(JSON.stringify({ runId, operationsVerified: Math.min(offset + 50, snapshot.items.length), total: snapshot.items.length, embedded: records.length }));
        } catch (error) {
          await pool.query(`UPDATE vector_sync_queue SET status='failed',lease_id=NULL,lease_expires_at=NULL,updated_at=now()
            WHERE id=ANY($1::text[]) AND status='processing' AND lease_id=$2`, [ids, leaseId]);
          throw error;
        }
      }
      await runRecoveryBatches(snapshot.items.length, recoverBatch);
    }
    await assertSources(snapshot.items);
    const current = await readRows(snapshot.rows.map(row => row.id));
    assert.equal(current.length, 2083);
    if (phase.endsWith("-short")) {
      const resolved = current.filter(row => row.status === "completed" && (row.payload as Record<string, any>).vectorizeRecovery?.runId === runId).length;
      const report = { runId, accepted: false, partial: true, staged: phase === "stage-short", resolvedRows: resolved, remainingRows: current.length - resolved, reason: phase === "stage-short" ? "Index writes await independent readback; long IDs remain excluded" : "Long logical IDs require approved shared Vector API compatibility" };
      await writeFile(`${target.output}/vector-recovery.json`, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report));
      return;
    }
    assert.ok(current.every(row => row.status === "completed" && (row.payload as Record<string, any>).vectorizeRecovery?.runId === runId));
    const records = new Map<string, CanonicalVectorRecord>();
    const leaves = new Set(current.map(row => (row.payload as Record<string, any>).vectorizeRecovery.checkpoint as string));
    for (const leaf of leaves) {
      assert.match(leaf, /^batch-[a-f0-9]{64}\.json$/);
      const cache = await load<{ planHash: string; records: CanonicalVectorRecord[] }>(leaf);
      assert.equal(leaf, `batch-${cache.planHash}.json`);
      for (const record of cache.records) records.set(record.id, record);
    }
    for (let offset = 0; offset < snapshot.items.length; offset += 50) {
      const batch = snapshot.items.slice(offset, offset + 50);
      const expected = batch.filter(item => item.outbox.operation === "upsert").map(item => { const record = records.get(item.outbox.vectorId); assert.ok(record, "RECOVERY_CHECKPOINT_MISSING"); assert.ok(matchesRecoveryVector(item, record)); return record; });
      assert.equal((await inspect(batch, expected)).length, 0);
    }
    const totals = await pool.query("SELECT status,count(*)::int AS count FROM vector_sync_queue GROUP BY status ORDER BY status");
    const report = { runId, accepted: true, resolvedRows: current.length, verifiedLiveUpserts: 2042, verifiedDeletes: 26, queue: totals.rows, snapshotHash: snapshot.hash };
    await save("verified.json", report);
    await writeFile(`${target.output}/vector-recovery.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } catch (error) {
    const failure = error as { name?: string; code?: string; message?: string };
    let message = String(failure.message ?? "Unknown failure");
    for (const value of Object.values(config)) if (typeof value === "string" && value.length > 8) message = message.replaceAll(value, "[redacted]");
    await save("failure.json", { name: failure.name, code: failure.code, message });
    console.error(JSON.stringify({ errorName: failure.name, errorCode: /^[A-Z0-9_]+$/.test(failure.code ?? "") ? failure.code : "unclassified" }));
    throw error;
  } finally { await pool.end(); }
}

if (import.meta.main) main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message.split("\n")[0] : "";
  const code = /^[A-Z][A-Z0-9_]+$/.test(message) ? message : "PRIVATE_DIAGNOSTIC_REQUIRED";
  console.error(`VECTOR_RECOVERY_FAILED:${code}; retained private snapshot and embedding checkpoints`);
  process.exitCode = 1;
});
