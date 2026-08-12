import { readFile } from "node:fs/promises";
import {
  parseCliArgs,
  readArtifact,
  requiredCliArg,
  writeArtifact,
} from "@/lib/staging/migration-ledger";
import {
  validatePedagogyHumanReview,
  type PedagogyHumanReviewDraft,
  type PedagogyHumanReviewSubmission,
} from "@/lib/zyra/pedagogy/human-review";

interface ShadowArtifact {
  remoteShadow?: { status?: string; visibleResponse?: string };
  attemptedCases?: number;
  passedCases?: number;
  failedCases?: number;
  providerCallUpperBound?: number;
  duplicateLearnerVisibleMessages?: number;
  learnerSideEffectsSuppressed?: boolean;
}

function safeCode(error: unknown): string {
  if (error instanceof Error && /^[A-Z0-9_:-]{1,120}$/.test(error.message)) return error.message;
  return "PEDAGOGY_HUMAN_REVIEW_VALIDATION_FAILED";
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const submissionFile = requiredCliArg(args, "submission-file");

  try {
    const [draft, shadow, submissionText] = await Promise.all([
      readArtifact<PedagogyHumanReviewDraft>(runId, "plan-007-pedagogy-human-review.json"),
      readArtifact<ShadowArtifact>(runId, "plan-007-pedagogy-shadow.json"),
      readFile(submissionFile, "utf8"),
    ]);
    const submission = JSON.parse(submissionText) as PedagogyHumanReviewSubmission;
    const review = validatePedagogyHumanReview(draft, submission);
    const remotePassed = shadow.remoteShadow?.status === "passed"
      && shadow.remoteShadow.visibleResponse === "legacy"
      && shadow.failedCases === 0
      && shadow.attemptedCases === shadow.passedCases
      && shadow.duplicateLearnerVisibleMessages === 0
      && shadow.learnerSideEffectsSuppressed === true;
    const passed = remotePassed && review.status === "passed";
    const artifact = {
      status: passed ? "passed" : "partial",
      plan: "007",
      phase: "staging_pedagogy_release_gate",
      runId,
      remoteShadow: {
        status: remotePassed ? "passed" : "failed",
        attemptedCases: shadow.attemptedCases ?? 0,
        passedCases: shadow.passedCases ?? 0,
        failedCases: shadow.failedCases ?? 0,
        providerCallUpperBound: shadow.providerCallUpperBound ?? 0,
        duplicateLearnerVisibleMessages: shadow.duplicateLearnerVisibleMessages ?? -1,
        learnerSideEffectsSuppressed: shadow.learnerSideEffectsSuppressed ?? false,
      },
      humanReview: review,
      secretsPrinted: false,
      authenticatedUrlsPrinted: false,
    };
    const path = await writeArtifact(runId, "plan-007-result.json", artifact);
    console.log(JSON.stringify({
      status: artifact.status,
      runId,
      remoteShadow: artifact.remoteShadow.status,
      humanReview: review.status,
      reviewItemCount: review.reviewItemCount,
      overallAverage: review.overallAverage,
      resultArtifact: path,
    }));
    if (!passed) process.exitCode = 2;
  } catch (error) {
    const reasonCode = safeCode(error);
    await writeArtifact(runId, "plan-007-result.json", {
      status: "blocked",
      plan: "007",
      phase: "staging_pedagogy_release_gate",
      runId,
      reasonCode,
      secretsPrinted: false,
      authenticatedUrlsPrinted: false,
    }).catch(() => undefined);
    console.error(JSON.stringify({ status: "blocked", runId, reasonCode }));
    process.exitCode = 1;
  }
}

await main();
