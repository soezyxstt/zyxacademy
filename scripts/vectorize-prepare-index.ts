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
  requiredCliArg,
  writeArtifact,
} from "@/lib/staging/migration-ledger";
import {
  CANONICAL_INDEXED_METADATA_ALLOWLIST,
  CANONICAL_VECTOR_INDEX,
  CANONICAL_VECTOR_PROFILE,
} from "@/lib/vectorize/contracts";

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

function indexDetails(): JsonObject {
  const result = parseJsonOutput(runWrangler(["vectorize", "get", CANONICAL_VECTOR_INDEX, "--json"]));
  if (Array.isArray(result)) return (result[0] ?? {}) as JsonObject;
  return result as JsonObject;
}

function metadataProperties(): string[] {
  const result = parseJsonOutput(runWrangler(["vectorize", "list-metadata-index", CANONICAL_VECTOR_INDEX, "--json"]));
  if (Array.isArray(result)) {
    return result.map((value) => typeof value === "string" ? value : String((value as JsonObject).propertyName ?? (value as JsonObject).name ?? "")).filter(Boolean);
  }
  if (result && typeof result === "object") {
    const object = result as JsonObject;
    const values = object.properties ?? object.metadataIndexes ?? object.indexes;
    if (Array.isArray(values)) return values.map((value) => typeof value === "string" ? value : String((value as JsonObject).propertyName ?? (value as JsonObject).name ?? ""));
  }
  return [];
}

function createMissingMetadataIndexes(existing: Set<string>): string[] {
  const created: string[] = [];
  for (const property of CANONICAL_INDEXED_METADATA_ALLOWLIST) {
    if (existing.has(property)) continue;
    const type = property === "version" ? "number" : "string";
    runWrangler([
      "vectorize",
      "create-metadata-index",
      CANONICAL_VECTOR_INDEX,
      `--property-name=${property}`,
      `--type=${type}`,
    ]);
    created.push(property);
  }
  return created;
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const requestedEnvironment = requiredCliArg(args, "env");
  if (requestedEnvironment !== "staging") throw new Error("Plan 012 index preparation only supports --env staging");

  try {
    assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requireMutation: true,
      requiredResources: ["database", "authUrl", "vectorizeWorker"],
    });
    const details = indexDetails();
    const config = details.config && typeof details.config === "object" ? details.config as JsonObject : details;
    const dimensions = Number(config.dimensions);
    const metric = String(config.metric ?? config.distance ?? "").toLowerCase();
    if (dimensions !== CANONICAL_VECTOR_PROFILE.dimensions || metric !== CANONICAL_VECTOR_PROFILE.metric) {
      throw new Error(`Incompatible canonical index: dimensions=${dimensions}, metric=${metric}`);
    }
    const before = metadataProperties();
    if (before.length > 10) throw new Error(`Canonical metadata index count exceeds provider limit: ${before.length}`);
    const created = createMissingMetadataIndexes(new Set(before));
    const after = metadataProperties();
    const expected = [...CANONICAL_INDEXED_METADATA_ALLOWLIST].sort();
    const actual = [...new Set(after)].sort();
    const missing = expected.filter((property) => !actual.includes(property));
    if (missing.length > 0 || actual.length > 10) throw new Error(`Canonical metadata indexes are incomplete: missing=${missing.join(",")}`);

    const artifact = {
      status: "passed",
      runId,
      environment: "staging",
      indexName: CANONICAL_VECTOR_INDEX,
      profileId: CANONICAL_VECTOR_PROFILE.id,
      dimensions,
      metric,
      metadataIndexesBefore: before.sort(),
      metadataIndexesCreated: created.sort(),
      metadataIndexesAfter: actual,
      firstVectorUpsertGuard: "passed",
    };
    await writeArtifact(runId, "plan-012-prepare.json", artifact);
    console.log(JSON.stringify({ ...artifact, artifact: artifactFile(runId, "plan-012-prepare.json") }));
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", ...safe }));
    process.exitCode = 1;
  }
}

void main();
