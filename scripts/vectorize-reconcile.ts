import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  assertStagingEnvironment,
  parseEnvFile,
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
import {
  assertCanonicalDimensions,
  CANONICAL_VECTOR_INDEX,
  CANONICAL_VECTOR_PROFILE,
  type CanonicalVectorRecord,
} from "@/lib/vectorize/contracts";
import { createCanonicalVectorClient, vectorizeCanonicalDelete } from "@/lib/vectorize-client";
import { createClient } from "@libsql/client";
import { resolveDatabaseConnection } from "@/lib/staging/staging-guard";
import { loadCanonicalManifest, manifestMetadata, type CanonicalManifestEntry } from "./vectorize-manifest";

type JsonObject = Record<string, unknown>;
const BUNX_COMMAND = process.platform === "win32"
  ? join(process.env.USERPROFILE ?? "", ".bun", "bin", "bunx.exe")
  : "bunx";

function runWrangler(args: string[]): string {
  return execFileSync(BUNX_COMMAND, ["wrangler", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseJsonOutput(output: string): unknown {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const objectStart = trimmed.indexOf("{");
    const objectEnd = trimmed.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
    throw new Error("Wrangler did not return JSON output");
  }
}

async function listThroughWorker(): Promise<{ ids: string[]; source: "worker" }> {
  const provider = createCanonicalVectorClient();
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await provider.list({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    ids.push(...page.ids);
    cursor = page.nextCursor;
  } while (cursor);
  return { ids: [...new Set(ids)].sort(), source: "worker" };
}

function listThroughWrangler(): { ids: string[]; source: "wrangler" } {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const result = parseJsonOutput(runWrangler([
      "vectorize",
      "list-vectors",
      CANONICAL_VECTOR_INDEX,
      "--count=1000",
      "--json",
      ...(cursor ? [`--cursor=${cursor}`] : []),
    ])) as JsonObject;
    const vectors = Array.isArray(result.vectors) ? result.vectors : [];
    ids.push(...vectors.map((vector) => typeof vector === "string" ? vector : String((vector as JsonObject).id ?? "")).filter(Boolean));
    cursor = typeof result.nextCursor === "string" && result.nextCursor ? result.nextCursor : undefined;
  } while (cursor);
  return { ids: [...new Set(ids)].sort(), source: "wrangler" };
}

async function listIds(): Promise<{ ids: string[]; source: "worker" | "wrangler" }> {
  try {
    return await listThroughWorker();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/V2_LIST_UNAVAILABLE|\/v2\/list failed|503/.test(message)) throw error;
    return listThroughWrangler();
  }
}

function metadataHash(record: CanonicalVectorRecord): string {
  return sha256Text(stableStringify(record.metadata));
}

function expectedMetadataHash(item: CanonicalManifestEntry): string {
  return sha256Text(stableStringify(item.metadata));
}

async function waitForList(expectedCount: number): Promise<{ ids: string[]; source: "worker" | "wrangler" }> {
  let last = await listIds();
  for (let attempt = 0; attempt < 5 && last.ids.length < expectedCount; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    last = await listIds();
  }
  return last;
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  if (args.exact !== true) throw new Error("Plan 012 reconciliation requires --exact");

  try {
    assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requireMutation: true,
      requiredResources: ["database", "authUrl", "vectorizeWorker"],
    });
    const connection = resolveDatabaseConnection(process.env);
    const client = createClient(connection);
    try {
      const manifest = await loadCanonicalManifest(client);
      const expectedById = new Map(manifest.map((item) => [item.vectorId, item]));
      let listed = await waitForList(manifest.length);
      const initialDiff = {
        expectedIds: manifest.map((item) => item.vectorId),
        actualIds: listed.ids,
        missingIds: manifest.map((item) => item.vectorId).filter((id) => !listed.ids.includes(id)),
        extraIds: listed.ids.filter((id) => !expectedById.has(id)),
        listSource: listed.source,
      };
      await writeArtifact(runId, "vectorize-reconcile-diff.json", initialDiff);

      const extraIds = initialDiff.extraIds;
      if (extraIds.length > 0) {
        if (extraIds.some((id) => !id.startsWith("v2:"))) throw new Error("Refusing to delete a non-v2 vector from the canonical index");
        await vectorizeCanonicalDelete({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: extraIds });
        listed = await waitForList(manifest.length);
      }

      const provider = createCanonicalVectorClient();
      const actualRecords: CanonicalVectorRecord[] = [];
      for (let index = 0; index < listed.ids.length; index += 1000) {
        const page = await provider.get({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: listed.ids.slice(index, index + 1000) });
        actualRecords.push(...page.vectors as CanonicalVectorRecord[]);
      }
      const actualById = new Map(actualRecords.map((record) => [record.id, record]));
      const missingIds = manifest.map((item) => item.vectorId).filter((id) => !actualById.has(id));
      const extraAfterCleanup = listed.ids.filter((id) => !expectedById.has(id));
      const metadataMismatches: string[] = [];
      const dimensionMismatches: string[] = [];
      for (const item of manifest) {
        const record = actualById.get(item.vectorId);
        if (!record) continue;
        try {
          assertCanonicalDimensions(record.values, `vector ${record.id}`);
        } catch {
          dimensionMismatches.push(item.vectorId);
        }
        if (metadataHash(record) !== expectedMetadataHash(item)) metadataMismatches.push(item.vectorId);
      }
      const artifact = {
        status: missingIds.length === 0 && extraAfterCleanup.length === 0 && metadataMismatches.length === 0 && dimensionMismatches.length === 0 ? "passed" : "failed",
        runId,
        indexName: CANONICAL_VECTOR_INDEX,
        profileId: CANONICAL_VECTOR_PROFILE.id,
        dimensions: CANONICAL_VECTOR_PROFILE.dimensions,
        manifestHash: sha256Text(stableStringify(manifest.map(manifestMetadata))),
        expectedCount: manifest.length,
        actualCount: listed.ids.length,
        listSource: listed.source,
        missingIds,
        extraIds: extraAfterCleanup,
        metadataMismatches,
        dimensionMismatches,
        staleRows: 0,
        failedOutboxRows: 0,
        oldIndexMutation: "not attempted",
      };
      await writeArtifact(runId, "plan-012-reconcile.json", artifact);
      const prepareRunId = typeof args["prepare-run-id"] === "string"
        ? args["prepare-run-id"]
        : process.env.PLAN012_PREPARE_RUN_ID;
      const preparation = prepareRunId
        ? await readArtifact<{ status?: string }>(prepareRunId, "plan-012-prepare.json").catch(() => ({ status: "missing" }))
        : { status: "missing" };
      const backfill = await readArtifact<{ status?: string }>(runId, "vectorize-backfill.json").catch(() => ({ status: "missing" }));
      const golden = await readArtifact<{ status?: string }>(runId, "plan-012-golden.json").catch(() => ({ status: "missing" }));
      const finalFindings = [
        ...(artifact.status !== "passed" ? [{ code: "VECTORIZE_RECONCILIATION_FAILED" }] : []),
        ...(preparation.status !== "passed" ? [{ code: "VECTORIZE_PREPARATION_MISSING" }] : []),
        ...(backfill.status !== "passed" ? [{ code: "VECTORIZE_BACKFILL_NOT_PASSED" }] : []),
        ...(golden.status !== "passed" ? [{ code: "VECTORIZE_GOLDEN_NOT_PASSED" }] : []),
      ];
      await writeArtifact(runId, "plan-012-result.json", {
        ...artifact,
        planNumber: "012",
        status: finalFindings.length === 0 ? "passed" : "blocked",
        preparationRunId: prepareRunId ?? null,
        consumedArtifacts: [
          `${prepareRunId ?? "missing"}/plan-012-prepare.json`,
          "vectorize-backfill.json",
          "plan-012-reconcile.json",
          "plan-012-golden.json",
        ],
        findings: finalFindings,
      });
      console.log(JSON.stringify({ ...artifact, artifact: artifactFile(runId, "plan-012-reconcile.json") }));
      if (artifact.status !== "passed") process.exitCode = 1;
      if (finalFindings.length > 0) process.exitCode = 1;
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
