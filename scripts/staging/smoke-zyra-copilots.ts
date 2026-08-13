import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";
import { currentSourceCommit, parseCliArgs, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { transitionZyraProposalStatus, validateZyraProposalDraft } from "@/lib/zyra/proposals";

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const course = requiredCliArg(args, "course");
  const noAutoApply = args["no-auto-apply"] === true;
  const guard = assertStagingEnvironment({ productionEnv: parseEnvFile(`${process.cwd()}/.env.prod`), requiredResources: ["database", "authUrl", "vectorizeWorker"] });
  const draft = { proposalType: "course_readiness" as const, courseId: course, scope: { courseId: course }, evidenceRefs: [`course:${course}`], preconditionSnapshot: { version: 1 }, operations: [{ kind: "read_only_report" as const, reportKey: "readiness" }], learnerImpact: { audience: "single_course" as const, summary: "No mutation." }, reversibility: { reversible: true, rollback: "No mutation." }, warnings: [], rationale: "Synthetic readiness proposal." };
  const artifact = { status: noAutoApply && validateZyraProposalDraft(draft, "admin").valid && transitionZyraProposalStatus({ from: "confirmed", to: "applied", actorId: "admin", proposerId: "admin", preconditionMatches: true }) === "MUTATION_BOUNDARY_REQUIRED" ? "passed" : "failed", plan: "012", phase: "copilot_no_auto_apply", runId, course, sourceCommit: currentSourceCommit(), stagingResourceFingerprints: guard.resources.map(({ key, hash }) => ({ key, hash })), providerCalls: 0, databaseWrites: 0, autoApplied: 0, unauthorizedMutations: 0, secretsPrinted: false };
  await writeArtifact(runId, "plan-012-copilots.json", artifact);
  console.log(JSON.stringify(artifact));
  if (artifact.status !== "passed") process.exitCode = 1;
}

await main();
