import { createHash, createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { db as applicationDb } from "@/lib/db";
import { migrationCheckpoints, migrationRuns } from "@/db/schema";

export type StagingDb = typeof applicationDb;

export type MigrationRunInput = {
  id: string;
  planNumber: string;
  sourceCommit: string;
  schemaVersion: string;
  databaseFingerprint: string;
  phase: string;
};

export type MigrationEvidence = {
  planNumber: string;
  status: "passed" | "failed" | "blocked";
  sourceCommit: string;
  migrationRunId: string;
  resourceFingerprints: Array<{ key: string; label: string; hash: string }>;
  commands: Array<{ command: string; exitCode: number }>;
  rowCounts?: Record<string, number>;
  reconciliationHashes?: Record<string, string>;
  featureFlags?: Record<string, string | undefined>;
  rollback?: { attempted: boolean; passed: boolean; detail: string };
  operatorTimestamp: string;
  knownLimitations?: string[];
};

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export function assertSafeRunId(runId: string): string {
  if (!RUN_ID_PATTERN.test(runId)) throw new Error("Invalid run id");
  return runId;
}

export function startMigrationRun(database: StagingDb, input: MigrationRunInput) {
  return database.insert(migrationRuns).values({
    id: assertSafeRunId(input.id),
    planNumber: input.planNumber,
    sourceCommit: input.sourceCommit,
    schemaVersion: input.schemaVersion,
    databaseFingerprint: input.databaseFingerprint,
    phase: input.phase,
    status: "running",
  });
}

export function finishMigrationRun(
  database: StagingDb,
  runId: string,
  values: {
    status: string;
    rowCountManifestHash?: string;
    errorCode?: string;
  },
) {
  return database
    .update(migrationRuns)
    .set({
      status: values.status,
      rowCountManifestHash: values.rowCountManifestHash,
      errorCode: values.errorCode,
      completedAt: new Date(),
    })
    .where(eq(migrationRuns.id, assertSafeRunId(runId)));
}

export function appendMigrationCheckpoint(
  database: StagingDb,
  values: {
    runId: string;
    phase: string;
    checkpoint: string;
    status: string;
    manifestHash?: string;
    rowCount?: number;
    details?: Record<string, unknown> | null;
  },
) {
  return database.insert(migrationCheckpoints).values({
    id: randomUUID(),
    runId: assertSafeRunId(values.runId),
    phase: values.phase,
    checkpoint: values.checkpoint,
    status: values.status,
    manifestHash: values.manifestHash,
    rowCount: values.rowCount,
    details: values.details ?? null,
  });
}

export function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hmacText(key: string, value: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

export function requireManifestKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.STAGING_EXPORT_KEY?.trim() || env.STAGING_MANIFEST_KEY?.trim();
  if (!key) throw new Error("STAGING_EXPORT_KEY is required for manifests and exports");
  return key;
}

export function artifactDirectory(runId: string): string {
  return join(process.cwd(), "artifacts", "staging-overhaul", assertSafeRunId(runId));
}

export function artifactFile(runId: string, fileName: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(fileName)) throw new Error("Invalid artifact file name");
  return join(artifactDirectory(runId), fileName);
}

export async function writeArtifact(runId: string, fileName: string, value: unknown): Promise<string> {
  const directory = artifactDirectory(runId);
  await mkdir(directory, { recursive: true });
  const path = artifactFile(runId, fileName);
  await writeFile(path, `${stableStringify(value)}\n`, "utf8");
  return path;
}

export async function readArtifact<T>(runId: string, fileName: string): Promise<T> {
  return JSON.parse(await readFile(artifactFile(runId, fileName), "utf8")) as T;
}

export async function writeEvidenceArtifact(evidence: MigrationEvidence): Promise<string> {
  return writeArtifact(evidence.migrationRunId, `plan-${evidence.planNumber}-result.json`, evidence);
}

export function parseCliArgs(argv: string[] = process.argv.slice(2)): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[name] = next;
      index += 1;
    } else {
      result[name] = true;
    }
  }
  return result;
}

export function requiredCliArg(args: Record<string, string | boolean>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing --${name}`);
  return value;
}

export function currentSourceCommit(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SOURCE_COMMIT?.trim()) return env.SOURCE_COMMIT.trim();
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
