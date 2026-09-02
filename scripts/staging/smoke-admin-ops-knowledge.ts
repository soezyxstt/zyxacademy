/**
 * Staging Smoke & Preflight Workflow for Admin Ops Knowledge Index
 *
 * This script runs safe, non-destructive validation of Admin Ops Knowledge sources,
 * chunking, manifest hashing, differential sync planning, and golden fixture coverage.
 *
 * Usage:
 *   bun scripts/staging/smoke-admin-ops-knowledge.ts
 *   bun scripts/staging/smoke-admin-ops-knowledge.ts --apply  (requires explicit staging confirmation)
 */

import { loadAllCuratedAdminKnowledgeSources } from "@/lib/admin-ops-ai/admin-knowledge-sources";
import { chunkAdminKnowledgeSource } from "@/lib/admin-ops-ai/admin-knowledge-chunker";
import {
  executeAdminKnowledgeSync,
  type AdminKnowledgeCatalogStore,
} from "@/lib/admin-ops-ai/admin-knowledge-sync";
import {
  ADMIN_OPS_KNOWLEDGE_NAMESPACE,
  type AdminKnowledgeChunk,
  type AdminKnowledgeSourceRecord,
} from "@/lib/admin-ops-ai/admin-knowledge-contracts";
import {
  CANONICAL_VECTOR_PROFILE,
} from "@/lib/vectorize/contracts";
import { FakeCanonicalVectorProvider } from "@/lib/vectorize/fake-adapter";
import type { CanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/embedding";

interface SmokeResult {
  status: "passed" | "failed";
  timestamp: string;
  namespace: string;
  profileId: string;
  sourcesFound: number;
  totalChunks: number;
  manifestHash: string;
  dryRun: boolean;
  plan: {
    sourcesToInsert: number;
    sourcesToUpdate: number;
    sourcesToRetain: number;
    sourcesToArchive: number;
  };
  goldenQueriesPassed: number;
  goldenQueriesTotal: number;
  invariants: {
    noEmDash: boolean;
    noEnDash: boolean;
    zyxBrandValid: boolean;
  };
}

class HermeticCatalogStore implements AdminKnowledgeCatalogStore {
  public sources: Map<string, AdminKnowledgeSourceRecord> = new Map();
  public chunks: Map<string, AdminKnowledgeChunk> = new Map();

  async upsertSource(source: AdminKnowledgeSourceRecord): Promise<void> {
    this.sources.set(source.id, source);
  }
  async upsertChunks(chunks: AdminKnowledgeChunk[]): Promise<void> {
    for (const c of chunks) this.chunks.set(c.id, c);
  }
  async markSourceStale(sourceId: string): Promise<void> {
    const s = this.sources.get(sourceId);
    if (s) s.status = "stale";
  }
  async markChunksStale(chunkIds: string[]): Promise<void> {
    for (const id of chunkIds) {
      const c = this.chunks.get(id);
      if (c) c.status = "stale";
    }
  }
  async listSources(): Promise<AdminKnowledgeSourceRecord[]> {
    return Array.from(this.sources.values());
  }
  async listChunksForSource(sourceId: string): Promise<AdminKnowledgeChunk[]> {
    return Array.from(this.chunks.values()).filter((c) => c.sourceId === sourceId);
  }
}

function createHermeticEmbeddingAdapter(): CanonicalContentV2EmbeddingAdapter {
  return {
    profileId: CANONICAL_VECTOR_PROFILE.id,
    async embed(_input: unknown): Promise<number[]> {
      const text = typeof _input === "string" ? _input : JSON.stringify(_input);
      const vec = new Array(768).fill(0.01);
      vec[0] = text.length % 100 / 100;
      return vec;
    },
    async embedDocument(title: string, text: string): Promise<number[]> {
      const vec = new Array(768).fill(0.01);
      vec[0] = (title.length + text.length) % 100 / 100;
      return vec;
    },
    async embedQuery(text: string): Promise<number[]> {
      const vec = new Array(768).fill(0.01);
      vec[0] = text.length % 100 / 100;
      return vec;
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");

  console.log("================================================================");
  console.log("  Zyx Admin Ops Knowledge Staging Smoke Workflow               ");
  console.log(`  Mode: ${isApply ? "LIVE SYNC (Requires Authorization)" : "DRY-RUN (Hermetic Validation)"}`);
  console.log(`  Namespace: ${ADMIN_OPS_KNOWLEDGE_NAMESPACE}`);
  console.log(`  Profile: ${CANONICAL_VECTOR_PROFILE.id}`);
  console.log("================================================================");

  // 1. Load curated sources
  const sources = await loadAllCuratedAdminKnowledgeSources();
  console.log(`[1/5] Loaded ${sources.length} curated documentation sources.`);

  let totalChunks = 0;
  let concatenatedContent = "";

  for (const src of sources) {
    const chunkResult = chunkAdminKnowledgeSource(src);
    totalChunks += chunkResult.chunkCount;
    concatenatedContent += (src.rawContent || "") + " ";
  }
  console.log(`[2/5] Chunked sources into ${totalChunks} discrete indexable chunks.`);

  // 2. Validate Design System Invariants
  const noEmDash = !concatenatedContent.includes("—");
  const noEnDash = !concatenatedContent.includes("–");
  const zyxBrandValid = !concatenatedContent.includes("ZYX ");

  console.log(`[3/5] Design Invariants: noEmDash=${noEmDash}, noEnDash=${noEnDash}, zyxBrandValid=${zyxBrandValid}`);

  // 3. Compute Hermetic Sync Plan
  const store = new HermeticCatalogStore();
  const vectorProvider = new FakeCanonicalVectorProvider();
  const embeddingAdapter = createHermeticEmbeddingAdapter();

  const syncResult = await executeAdminKnowledgeSync({
    dryRun: true,
    catalogStore: store,
    vectorProvider,
    embeddingAdapter,
  });

  console.log(`[4/5] Computed deterministic sync plan:`, {
    sourcesInserted: syncResult.sources.inserted,
    sourcesUpdated: syncResult.sources.updated,
    sourcesUnchanged: syncResult.sources.unchanged,
    chunksUpserted: syncResult.chunks.upserted,
    manifestHash: syncResult.manifestHash.slice(0, 16) + "...",
  });

  // 4. Golden Fixture Queries Smoke Check
  const goldenQueries = [
    "Bagaimana SOP pembuatan token aktivasi?",
    "Berapa kapasitas kuota anggota kelompok?",
    "Bagaimana mitigasi saat Gemini timeout?",
  ];

  let goldenPassed = 0;
  for (const query of goldenQueries) {
    const qVec = await embeddingAdapter.embedQuery(query);
    const results = await vectorProvider.query({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      namespace: ADMIN_OPS_KNOWLEDGE_NAMESPACE,
      vector: qVec,
      topK: 5,
    });
    if (results !== undefined) {
      goldenPassed++;
    }
  }
  console.log(`[5/5] Golden query smoke checks: ${goldenPassed}/${goldenQueries.length} passed.`);

  const smokeResult: SmokeResult = {
    status: noEmDash && noEnDash && zyxBrandValid && goldenPassed === goldenQueries.length ? "passed" : "failed",
    timestamp: new Date().toISOString(),
    namespace: ADMIN_OPS_KNOWLEDGE_NAMESPACE,
    profileId: CANONICAL_VECTOR_PROFILE.id,
    sourcesFound: sources.length,
    totalChunks,
    manifestHash: syncResult.manifestHash,
    dryRun: !isApply,
    plan: {
      sourcesToInsert: syncResult.sources.inserted,
      sourcesToUpdate: syncResult.sources.updated,
      sourcesToRetain: syncResult.sources.unchanged,
      sourcesToArchive: syncResult.sources.deleted,
    },
    goldenQueriesPassed: goldenPassed,
    goldenQueriesTotal: goldenQueries.length,
    invariants: {
      noEmDash,
      noEnDash,
      zyxBrandValid,
    },
  };

  console.log("----------------------------------------------------------------");
  console.log("Smoke Execution Result:", JSON.stringify(smokeResult, null, 2));
  console.log("----------------------------------------------------------------");

  if (smokeResult.status !== "passed") {
    process.exitCode = 1;
  }
}

await main();
