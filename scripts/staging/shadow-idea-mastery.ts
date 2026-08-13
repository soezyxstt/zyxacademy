import { computeIdeaMastery, hashIdeaMasteryState } from "@/lib/pemahaman/engine";
import {
  currentSourceCommit,
  parseCliArgs,
  requiredCliArg,
  sha256Text,
  stableStringify,
  writeArtifact,
} from "@/lib/staging/migration-ledger";
import { loadEvidenceGroups, openStagingIdeaDb, resolveCourse } from "./idea-mastery-support";

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const requestedCourseId = typeof args.course === "string" ? args.course : "tutorial-pka";
  const asOf = new Date(typeof args["as-of"] === "string" ? args["as-of"] : new Date().toISOString());
  let client: { close(): void } | null = null;

  try {
    const opened = openStagingIdeaDb(false);
    client = opened.client;
    const resolution = await resolveCourse(opened.db, requestedCourseId);
    const groups = await loadEvidenceGroups(opened.db, resolution.ideaIds);
    const states = groups.map((group) => {
      const state = computeIdeaMastery(group.ideId, group.evidence, asOf);
      const excludedCount = group.evidence.length - state.evidenceCount;
      return {
        penggunaIdHash: sha256Text(group.penggunaId).slice(0, 16),
        ideaId: group.ideId,
        score: state.score,
        confidence: state.confidence,
        evidenceCount: state.evidenceCount,
        stateHash: hashIdeaMasteryState(state),
        delta: null,
        reasonCode: excludedCount > 0 && state.evidenceCount === 0 ? "AMBIGUOUS_OR_REJECTED_EVIDENCE_EXCLUDED" : "IDEA_ATTRIBUTED_EVIDENCE_ONLY",
      };
    });
    const invalidStates = states.filter((state) => state.score < 0 || state.score > 100 || state.confidence < 0 || state.confidence > 100);
    const report = {
      planNumber: "011",
      phase: "shadow",
      runId,
      status: invalidStates.length === 0 ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      requestedCourseId,
      normalizedCourseId: resolution.normalizedCourseId,
      fixtureMode: resolution.fixtureMode,
      fallbackReason: resolution.fallbackReason,
      asOf: asOf.toISOString(),
      ideaCount: resolution.ideaIds.length,
      evidenceGroupCount: groups.length,
      stateCount: states.length,
      states,
      invalidStates,
      totalWrites: 0,
      aiCalls: 0,
      visibleMasteryChanged: false,
      shadowHash: sha256Text(stableStringify(states)),
      commands: [
        "bun --env-file=.env.staging run staging:preflight",
        `bun --env-file=.env.staging run staging:shadow-idea-mastery -- --run-id ${runId} --course ${requestedCourseId}`,
      ],
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-011-shadow.json", report);
    console.log(JSON.stringify({ status: report.status, runId, ideaCount: report.ideaCount, evidenceGroupCount: report.evidenceGroupCount, totalWrites: report.totalWrites }));
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ status: "blocked", runId, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  } finally {
    client?.close();
  }
}

void main();
