import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPedagogyContext } from "@/lib/zyra/pedagogy/context";
import { composeSafeTeachingResponse } from "@/lib/zyra/pedagogy/composer";
import { buildPedagogyPromptInput } from "@/lib/zyra/pedagogy/prompt-input";
import { selectTeachingPlan } from "@/lib/zyra/pedagogy/state-machine";
import { validateTeachingResponse, pipelineLanguageRegex } from "@/lib/zyra/pedagogy/validators";
import type { HintLevel, PedagogyContext, TeachingState } from "@/lib/zyra/pedagogy/contracts";
import { currentSourceCommit } from "@/lib/staging/migration-ledger";

interface GoldenCase {
  id: string;
  course: string;
  domain: string;
  action: PedagogyContext["action"];
  activeAssessment: boolean;
  previousHintLevel?: HintLevel;
  misconceptionUncertain?: boolean;
  evidenceSufficiency?: PedagogyContext["evidenceSufficiency"];
  expectedState: TeachingState;
  requiresCheckpoint: boolean;
}

interface GoldenFixture {
  schemaVersion: string;
  suite: string;
  cases: GoldenCase[];
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function loadFixture(): GoldenFixture {
  return JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/ai/zyra-pedagogy-v3.json"), "utf8")) as GoldenFixture;
}

function buildCaseContext(item: GoldenCase): PedagogyContext {
  return buildPedagogyContext({
    courseId: item.course,
    chapterId: "chapter-1",
    question: `jelaskan konsep ${item.domain} ${item.id}`,
    action: item.action,
    activityKind: item.activeAssessment ? "quiz" : "study",
    attemptState: item.activeAssessment ? "in_progress" : "none",
    answerReleaseState: item.activeAssessment ? "hidden" : "released",
    matchState: item.activeAssessment ? "exact" : "none",
    allowDirectAnswerReveal: !item.activeAssessment,
    assessmentReasonCode: item.activeAssessment ? "ACTIVE_ASSESSMENT_SOCRATIC_ONLY" : "STUDY_PRACTICE_ALLOWED",
    evidenceSufficiency: item.evidenceSufficiency ?? "sufficient",
    previousHintLevel: item.previousHintLevel,
    misconceptionUncertain: item.misconceptionUncertain,
    learnerResponseShape: item.activeAssessment ? "short_answer" : "free_text",
  });
}

async function main(): Promise<void> {
  const fixture = loadFixture();
  const results = fixture.cases.map((item) => {
    const context = buildCaseContext(item);
    const plan = selectTeachingPlan(context);
    const sourceContent = item.activeAssessment
      ? `Materi ${item.domain} menjelaskan prinsip umum.\nJawaban: opsi B.`
      : `Materi ${item.domain} menjelaskan prinsip umum untuk ${item.id}.`;
    const source = {
      id: `v2:idea:${item.id}:1`,
      version: 1,
      kind: item.activeAssessment ? "practice_question" : "ko",
      title: `Materi ${item.domain}`,
      content: sourceContent,
      href: `/courses/${item.course}/material`,
    };
    const promptInput = buildPedagogyPromptInput(context, plan, context.explicitTopic, [source]);
    const response = composeSafeTeachingResponse(context, plan, promptInput.evidence, "GOLDEN_COMPOSITION");
    const validation = validateTeachingResponse(response, context, plan, new Map([[source.id, source.version]]), {
      correctOptions: item.activeAssessment ? ["B"] : undefined,
    });
    const codes = validation.violations.map((violation) => violation.code);

    return {
      id: item.id,
      expectedState: item.expectedState,
      selectedState: response.selectedState,
      stateCompliant: response.selectedState === item.expectedState,
      checkpointRequired: item.requiresCheckpoint,
      checkpointPresent: Boolean(response.checkForUnderstanding),
      checkpointCompliant: !item.requiresCheckpoint || Boolean(response.checkForUnderstanding),
      citationCount: response.citations.length,
      citationValid: !codes.includes("INVALID_CITATION") && !codes.includes("UNSUPPORTED_CLAIM"),
      activeAssessmentLeak: codes.includes("ACTIVE_ASSESSMENT_LEAK"),
      unsupportedClaim: codes.includes("UNSUPPORTED_CLAIM"),
      pipelineLanguageLeak: pipelineLanguageRegex().test(response.learnerFacingText),
      validatorCodes: codes,
      responseHash: hash(response.learnerFacingText),
    };
  });

  const stateCompliant = results.filter((result) => result.stateCompliant).length;
  const checkpointCompliant = results.filter((result) => result.checkpointCompliant).length;
  const activeAssessmentLeaks = results.filter((result) => result.activeAssessmentLeak).length;
  const unsupportedClaims = results.filter((result) => result.unsupportedClaim).length;
  const invalidCitations = results.filter((result) => !result.citationValid).length;
  const pipelineLanguageLeaks = results.filter((result) => result.pipelineLanguageLeak).length;
  const artifact = {
    status: stateCompliant / results.length >= 0.95
      && checkpointCompliant / results.length >= 0.95
      && activeAssessmentLeaks === 0
      && unsupportedClaims === 0
      && invalidCitations === 0
      && pipelineLanguageLeaks === 0
      ? "passed"
      : "failed",
    plan: "007",
    suite: fixture.suite,
    schemaVersion: fixture.schemaVersion,
    sourceCommit: currentSourceCommit(),
    caseCount: results.length,
    stateCompliance: stateCompliant / results.length,
    checkpointCompliance: checkpointCompliant / results.length,
    activeAssessmentLeaks,
    unsupportedClaims,
    invalidCitations,
    pipelineLanguageLeaks,
    providerCalls: 0,
    humanReviewStatus: "pending_maintainer_review",
    cases: results,
    secretsPrinted: false,
    authenticatedUrlsPrinted: false,
  };
  const dir = join(process.cwd(), "artifacts/zyra-ai/20260807-plan007-pedagogy-eval");
  mkdirSync(dir, { recursive: true });
  const artifactPath = join(dir, "plan-007-pedagogy-eval.json");
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`zyra pedagogy evaluation status=${artifact.status} cases=${artifact.caseCount} stateCompliance=${artifact.stateCompliance} checkpointCompliance=${artifact.checkpointCompliance} activeLeaks=${artifact.activeAssessmentLeaks} unsupportedClaims=${artifact.unsupportedClaims} providerCalls=${artifact.providerCalls} artifact=${artifactPath}`);
  if (artifact.status !== "passed") process.exitCode = 1;
}

await main();
