import { join } from "node:path";
import { currentSourceCommit, parseCliArgs, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile, safeGuardError } from "@/lib/staging/staging-guard";
import { retrieveCanonicalEvidence } from "@/lib/zyra/canonical-runtime";

function safeCourseId(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("INVALID_COURSE_ID");
  return value;
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const courseId = safeCourseId(requiredCliArg(args, "course"));
  const suite = requiredCliArg(args, "suite");
  if (suite !== "canonical" && suite !== "active-attempt") throw new Error("INVALID_ZYRA_SUITE");

  try {
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl", "vectorizeWorker"],
    });
    const activeAttempt = suite === "active-attempt";
    const result = await retrieveCanonicalEvidence({
      courseId,
      isEnrolled: true,
      activityKind: activeAttempt ? "quiz" : "study",
      attemptState: activeAttempt ? "in_progress" : "none",
      answerReleaseState: activeAttempt ? "hidden" : "released",
      matchState: activeAttempt ? "exact" : "none",
    }, activeAttempt ? "jelaskan konsep tanpa memberikan jawaban soal yang sedang dikerjakan" : "jelaskan konsep dasar dari materi kuliah");

    const answerLeakFindings = result.sources
      .filter((source) => activeAttempt && source.entityType === "solution")
      .map((source) => ({ id: source.id, reason: "solution returned during active attempt" }));
    const artifact = {
      planNumber: "013",
      runId,
      status: answerLeakFindings.length === 0 ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      suite,
      stagingResourceFingerprints: guard.resources,
      result: {
        sourceCount: result.sources.length,
        rejectedCount: result.rejected.length,
        rejectedReasonCodes: [...new Set(result.rejected.map((item) => item.reasonCode))].sort(),
        answerLeakFindings,
      },
      runtimePolicy: { canonicalVectorize: "always-on", canonicalIdeaRuntime: "always-on" },
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, `plan-013-smoke-${suite}.json`, artifact);
    console.log(JSON.stringify({ status: artifact.status, runId, suite, sourceCount: result.sources.length }));
    if (artifact.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", runId, suite, ...safe }));
    process.exitCode = 1;
  }
}

void main();
