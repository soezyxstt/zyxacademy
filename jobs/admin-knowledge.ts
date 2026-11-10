import { inngest } from "./client";

/**
 * Inngest Worker for Admin Ops Knowledge synchronization.
 * Computes deterministic diffs, updates catalog, and syncs vectors to admin_ops_knowledge.
 */
export const adminOpsKnowledgeSyncWorker = inngest.createFunction(
  {
    id: "admin-ops-knowledge-sync-worker",
    name: "Admin Ops Knowledge Sync Worker",
    triggers: [{ event: "admin/knowledge.sync" }],
    concurrency: {
      limit: 1,
    },
  },
  async ({ step }: any) => {
    const result = await step.run("execute-knowledge-sync", async () => {
      const { executeAdminKnowledgeSync } = await import("@/lib/admin-ops-ai/admin-knowledge-sync");
      const { embedWorkerVectorDocuments } = await import("@/lib/compute/vector-embeddings");
      const { createCanonicalVectorClient } = await import("@/lib/vectorize-client");

      return await executeAdminKnowledgeSync({
        dryRun: false,
        embedDocuments: embedWorkerVectorDocuments,
        vectorProvider: createCanonicalVectorClient(),
      });
    });

    return {
      success: true,
      sourcesTotal: result.sources.total,
      chunksTotal: result.chunks.total,
      manifestHash: result.manifestHash,
    };
  }
);
