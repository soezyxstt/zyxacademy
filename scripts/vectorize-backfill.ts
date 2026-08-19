import { createClient } from "@libsql/client";
import { join } from "node:path";
import {
  assertStagingEnvironment,
  parseEnvFile,
  resolveDatabaseConnection,
  safeGuardError,
} from "@/lib/staging/staging-guard";
import {
  artifactFile,
  parseCliArgs,
  readArtifact,
  requiredCliArg,
  sha256Text,
  stableStringify,
  writeArtifact,
} from "@/lib/staging/migration-ledger";
import { CANONICAL_VECTOR_PROFILE } from "@/lib/vectorize/contracts";
import { getCanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/runtime";
import { vectorizeCanonicalUpsert } from "@/lib/vectorize-client";
import { loadCanonicalManifest, manifestMetadata, type CanonicalManifestEntry } from "./vectorize-manifest";

const BATCH_SIZE = 20;

type BackfillArtifact = {
  status: "running" | "passed" | "failed";
  runId: string;
  source: "turso";
  profileId: typeof CANONICAL_VECTOR_PROFILE.id;
  dimensions: number;
  manifestHash: string;
  expectedCount: number;
  processedVectorIds: string[];
  failedVectorIds: string[];
  lastError?: string;
};

function hasStringArg(args: Record<string, string | boolean>, name: string, expected: string): boolean {
  return args[name] === expected;
}

async function previousArtifact(runId: string): Promise<BackfillArtifact | undefined> {
  try {
    return await readArtifact<BackfillArtifact>(runId, "vectorize-backfill.json");
  } catch {
    return undefined;
  }
}

async function upsertBatch(entries: CanonicalManifestEntry[], adapter: Awaited<ReturnType<typeof getCanonicalContentV2EmbeddingAdapter>>): Promise<void> {
  const vectors = [];
  for (const item of entries) {
    const values = await adapter.embedDocument(item.title, item.content);
    vectors.push({ id: item.vectorId, values, metadata: item.metadata });
  }
  if (vectors.length > 0) {
    await vectorizeCanonicalUpsert({ profileId: CANONICAL_VECTOR_PROFILE.id, vectors });
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const source = requiredCliArg(args, "source");
  if (source !== "db" || !hasStringArg(args, "source", "db")) throw new Error("Plan 012 backfill source must be db");

  try {
    assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requireMutation: true,
      requiredResources: ["database", "authUrl", "vectorizeWorker"],
    });
    const connection = resolveDatabaseConnection(process.env);
    const client = createClient(connection);
    try {
      const courseId = typeof args.course === "string" ? args.course : undefined;
      const manifest = await loadCanonicalManifest(client, courseId);
      const manifestHash = sha256Text(stableStringify(manifest.map(manifestMetadata)));
      const prior = args.resume ? await previousArtifact(runId) : undefined;
      const processed = new Set(prior?.processedVectorIds ?? []);
      const artifact: BackfillArtifact = {
        status: "running",
        runId,
        source: "turso",
        profileId: CANONICAL_VECTOR_PROFILE.id,
        dimensions: CANONICAL_VECTOR_PROFILE.dimensions,
        manifestHash,
        expectedCount: manifest.length,
        processedVectorIds: [...processed].sort(),
        failedVectorIds: [],
      };
      await writeArtifact(runId, "vectorize-backfill.json", artifact);

      const adapter = await getCanonicalContentV2EmbeddingAdapter();
      const pending = manifest.filter((item) => !processed.has(item.vectorId));
      for (let index = 0; index < pending.length; index += BATCH_SIZE) {
        const batch = pending.slice(index, index + BATCH_SIZE);
        try {
          await upsertBatch(batch, adapter);
          batch.forEach((item) => processed.add(item.vectorId));
          artifact.processedVectorIds = [...processed].sort();
          artifact.failedVectorIds = [];
          await writeArtifact(runId, "vectorize-backfill.json", artifact);
          console.log(JSON.stringify({ runId, processed: processed.size, expected: manifest.length }));
        } catch (error) {
          artifact.status = "failed";
          artifact.failedVectorIds = batch.map((item) => item.vectorId);
          artifact.lastError = error instanceof Error ? error.message : String(error);
          await writeArtifact(runId, "vectorize-backfill.json", artifact);
          throw error;
        }
      }

      artifact.status = "passed";
      artifact.processedVectorIds = [...processed].sort();
      await writeArtifact(runId, "vectorize-backfill.json", artifact);
      console.log(JSON.stringify({
        status: "passed",
        runId,
        source: artifact.source,
        profileId: artifact.profileId,
        dimensions: artifact.dimensions,
        expectedCount: artifact.expectedCount,
        processedCount: artifact.processedVectorIds.length,
        artifact: artifactFile(runId, "vectorize-backfill.json"),
      }));
    } finally {
      client.close();
    }
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", ...safe }));
    process.exitCode = 1;
  }
}

void main();
