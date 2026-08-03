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
  requiredCliArg,
  writeArtifact,
} from "@/lib/staging/migration-ledger";
import { CANONICAL_VECTOR_PROFILE } from "@/lib/vectorize/contracts";
import { getCanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/runtime";
import { vectorizeCanonicalQuery } from "@/lib/vectorize-client";
import { createClient } from "@libsql/client";
import { loadCanonicalManifest, type CanonicalManifestEntry } from "./vectorize-manifest";

type GoldenCase = {
  vectorId: string;
  namespace: CanonicalManifestEntry["namespace"];
  query: string;
  topIds: string[];
  expectedIdFoundAtTop5: boolean;
};

async function restrictedCapabilityChecks(vector: number[]): Promise<{ deniedWithoutCapability: boolean; allowedWithCapability: boolean }> {
  const base = process.env.VECTORIZE_WORKER_URL;
  const secret = process.env.VECTORIZE_SHARED_SECRET;
  if (!base || !secret) throw new Error("staging Vectorize worker credentials are required");
  const request = async (capability?: string): Promise<Response> => fetch(`${base.replace(/\/$/, "")}/v2/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      vector,
      topK: 1,
      namespace: "published_solutions",
      ...(capability ? { capability } : {}),
    }),
  });
  const denied = await request();
  const allowed = await request("read:published_solutions");
  return { deniedWithoutCapability: denied.status === 403, allowedWithCapability: allowed.status === 200 };
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const requestedCourse = requiredCliArg(args, "course");

  try {
    assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl", "vectorizeWorker"],
    });
    const connection = resolveDatabaseConnection(process.env);
    const client = createClient(connection);
    try {
      let entries = await loadCanonicalManifest(client, requestedCourse);
      let normalizedCourse = requestedCourse;
      let fallbackReason: string | null = null;
      if (!entries.some((item) => item.courseId === requestedCourse && item.namespace === "canonical_ideas") && requestedCourse === "tutorial-pka") {
        const fallback = await loadCanonicalManifest(client, "mat-i");
        if (fallback.some((item) => item.courseId === "mat-i" && item.namespace === "canonical_ideas")) {
          entries = fallback;
          normalizedCourse = "mat-i";
          fallbackReason = "REQUESTED_COURSE_HAS_NO_PUBLISHED_IDEAS";
        }
      }
      const fixturesByNamespace = new Map<CanonicalManifestEntry["namespace"], CanonicalManifestEntry[]>();
      const fixtureQueryKeysByNamespace = new Map<CanonicalManifestEntry["namespace"], Set<string>>();
      for (const item of entries.filter((candidate) => candidate.courseId === normalizedCourse)) {
        const namespaceFixtures = fixturesByNamespace.get(item.namespace) ?? [];
        const fixtureQueryKeys = fixtureQueryKeysByNamespace.get(item.namespace) ?? new Set<string>();
        const queryKey = item.title.trim().toLowerCase() || item.contentHash;
        if (namespaceFixtures.length < 5 && !fixtureQueryKeys.has(queryKey)) {
          namespaceFixtures.push(item);
          fixtureQueryKeys.add(queryKey);
        }
        fixturesByNamespace.set(item.namespace, namespaceFixtures);
        fixtureQueryKeysByNamespace.set(item.namespace, fixtureQueryKeys);
      }
      const fixtures = [...fixturesByNamespace.values()].flat().slice(0, 12);
      if (fixtures.length === 0) throw new Error(`No canonical golden fixtures found for ${requestedCourse}`);

      const adapter = await getCanonicalContentV2EmbeddingAdapter();
      const cases: GoldenCase[] = [];
      for (const fixture of fixtures) {
        const vector = await adapter.embedQuery(fixture.content);
        const result = await vectorizeCanonicalQuery({
          profileId: CANONICAL_VECTOR_PROFILE.id,
          vector,
          topK: 5,
          namespace: fixture.namespace,
          ...(fixture.namespace === "published_solutions" ? { capability: "read:published_solutions" } : {}),
          filter: fixture.courseId ? { courseId: { $eq: fixture.courseId } } : undefined,
        });
        cases.push({
          vectorId: fixture.vectorId,
          namespace: fixture.namespace,
          query: fixture.title,
          topIds: result.matches.map((match) => match.id),
          expectedIdFoundAtTop5: result.matches.some((match) => match.id === fixture.vectorId),
        });
      }

      const capability = await restrictedCapabilityChecks(new Array(CANONICAL_VECTOR_PROFILE.dimensions).fill(0));
      const recallPassed = cases.length > 0 && cases.every((item) => item.expectedIdFoundAtTop5);
      const status = recallPassed && capability.deniedWithoutCapability && capability.allowedWithCapability ? "passed" : "failed";
      const artifact = {
        status,
        runId,
        requestedCourse,
        normalizedCourse,
        fallbackReason,
        profileId: CANONICAL_VECTOR_PROFILE.id,
        dimensions: CANONICAL_VECTOR_PROFILE.dimensions,
        topK: 5,
        cases,
        recallAt5: cases.filter((item) => item.expectedIdFoundAtTop5).length / cases.length,
        restrictedSolution: capability,
      };
      await writeArtifact(runId, "plan-012-golden.json", artifact);
      console.log(JSON.stringify({ ...artifact, artifact: artifactFile(runId, "plan-012-golden.json") }));
      if (status !== "passed") process.exitCode = 1;
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
