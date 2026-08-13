import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createClient } from "@libsql/client";
import {
  assertStagingEnvironment,
  parseEnvFile,
  resolveDatabaseConnection,
  safeGuardError,
} from "@/lib/staging/staging-guard";
import { buildPedagogyContext } from "@/lib/zyra/pedagogy/context";
import { composeSafeTeachingResponse } from "@/lib/zyra/pedagogy/composer";
import { buildPedagogyPromptInput } from "@/lib/zyra/pedagogy/prompt-input";
import {
  PedagogyHumanReviewDraftSchema,
  renderPedagogyHumanReviewPage,
  type PedagogyHumanReviewDraft,
} from "@/lib/zyra/pedagogy/human-review";
import {
  boundedPedagogyShadowCaseCount,
  PEDAGOGY_SHADOW_PROVIDER_CALL_UPPER_BOUND_PER_CASE,
  type PedagogyShadowComparison,
} from "@/lib/zyra/pedagogy/shadow";
import { selectTeachingPlan } from "@/lib/zyra/pedagogy/state-machine";
import { validateTeachingResponse } from "@/lib/zyra/pedagogy/validators";
import {
  runMaskedPedagogyStartupDiagnostics,
  type PedagogyStartupDiagnosticStep,
} from "@/lib/zyra/pedagogy/startup-diagnostics";
import {
  artifactFile,
  currentSourceCommit,
  parseCliArgs,
  requiredCliArg,
  writeArtifact,
} from "@/lib/staging/migration-ledger";

interface SmokeCase {
  id: string;
  course: string;
  domain: string;
  action: "new_topic" | "follow_up" | "hint_request" | "teach_back" | "check_response";
  activeAssessment: boolean;
  previousHintLevel?: "none" | "hint_1_concept" | "hint_2_representation" | "hint_3_analogous_example" | "hint_4_partial_step";
  misconceptionUncertain?: boolean;
  evidenceSufficiency?: "insufficient" | "limited" | "sufficient";
  expectedState: string;
}

function readCases(): SmokeCase[] {
  const fixture = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/ai/zyra-pedagogy-v3.json"), "utf8")) as { cases: SmokeCase[] };
  return fixture.cases;
}

function boundedCases(cases: SmokeCase[], maxRequests: number): SmokeCase[] {
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 40) {
    throw new Error("MAX_PROVIDER_REQUESTS_OUT_OF_RANGE");
  }
  return cases.slice(0, maxRequests);
}

function safeCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_:-]{1,100}$/.test(code)) return code;
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && /^[A-Z0-9_:-]{1,100}$/.test(message)) return message;
  }
  return "PEDAGOGY_REMOTE_SHADOW_FAILED";
}

function opaqueId(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

function requiredRemoteKeys(): string[] {
  return [
    "STAGING_ZYRA_PEDAGOGY_USER_ID",
    "ZYRA_CONTROL_PLANE_URL",
    "ZYRA_CONTROL_PLANE_TOKEN",
    "CF_AI_GATEWAY_URL",
    "CF_AI_GATEWAY_TOKEN",
    "VECTORIZE_WORKER_URL",
    "VECTORIZE_SHARED_SECRET",
    "GEMINI_API_KEY",
    "GEMINI_API_KEY_2",
    "GEMINI_API_KEY_3",
    "GEMINI_API_KEY_4",
    "GEMINI_PROJECT_ALIAS_1",
    "GEMINI_PROJECT_ALIAS_2",
    "GEMINI_PROJECT_ALIAS_3",
    "GEMINI_PROJECT_ALIAS_4",
  ].filter((key) => !process.env[key]?.trim());
}

async function verifyShadowIdentity(userId: string, courseId: string): Promise<{
  identityHash: string;
  canonicalCourseHash: string;
}> {
  const connection = resolveDatabaseConnection(process.env);
  const client = createClient({ url: connection.url, authToken: connection.authToken });
  try {
    const identity = (await client.execute({
      sql: `SELECT u.id, u.role, p.status,
        GROUP_CONCAT(DISTINCT r.code) AS roles
        FROM user u
        JOIN pengguna p ON p.id = u.id
        LEFT JOIN pengguna_peran pr ON pr.pengguna_id = u.id
        LEFT JOIN peran r ON r.id = pr.peran_id
        WHERE u.id = ?
        GROUP BY u.id, u.role, p.status`,
      args: [userId],
    })).rows[0];
    const roles = String(identity?.roles ?? "").split(",").filter(Boolean);
    if (!identity || identity.role !== "student" || identity.status !== "active" || !roles.includes("murid")) {
      throw new Error("PEDAGOGY_SHADOW_IDENTITY_NOT_ACTIVE_MURID");
    }

    const course = (await client.execute({
      sql: `SELECT c.id AS legacy_id, m.id AS canonical_id, m.status AS canonical_status
        FROM courses c
        JOIN mata_kuliah m ON m.legacy_course_id = c.id
        WHERE c.id = ?`,
      args: [courseId],
    })).rows[0];
    if (!course || course.canonical_status !== "active") {
      throw new Error("PEDAGOGY_SHADOW_CANONICAL_COURSE_NOT_ACTIVE");
    }

    const canonicalCourseId = String(course.canonical_id);
    const enrollment = (await client.execute({
      sql: `SELECT
        (SELECT COUNT(*) FROM enrollments
          WHERE user_id = ? AND course_id = ?
          AND expires_at > CAST(strftime('%s', 'now') AS INTEGER)) AS legacy_current,
        (SELECT COUNT(*) FROM pendaftaran_murid
          WHERE pengguna_id = ? AND mata_kuliah_id = ? AND status = 'active'
          AND (end_at IS NULL OR end_at > CAST(strftime('%s', 'now') AS INTEGER))) AS canonical_current`,
      args: [userId, courseId, userId, canonicalCourseId],
    })).rows[0];
    if (Number(enrollment?.legacy_current ?? 0) !== 1 || Number(enrollment?.canonical_current ?? 0) !== 1) {
      throw new Error("PEDAGOGY_SHADOW_ENROLLMENT_NOT_CURRENT");
    }

    const publishedQuestions = (await client.execute({
      sql: "SELECT COUNT(*) AS total FROM soal WHERE mata_kuliah_id = ? AND status = 'published'",
      args: [canonicalCourseId],
    })).rows[0];
    if (Number(publishedQuestions?.total ?? 0) < 1) {
      throw new Error("PEDAGOGY_SHADOW_CANONICAL_QUESTION_EVIDENCE_MISSING");
    }

    return {
      identityHash: opaqueId(userId),
      canonicalCourseHash: opaqueId(canonicalCourseId),
    };
  } finally {
    client.close();
  }
}

async function runStartupDiagnostics(
  runId: string,
  courseId: string,
  maxProviderRequests: number,
): Promise<void> {
  let guard: ReturnType<typeof assertStagingEnvironment> | undefined;
  let client: ReturnType<typeof createClient> | undefined;
  let canonicalCourseId: string | undefined;
  const userId = process.env.STAGING_ZYRA_PEDAGOGY_USER_ID?.trim() ?? "";

  const steps: PedagogyStartupDiagnosticStep[] = [
    {
      stage: "staging_guard",
      run: async () => {
        guard = assertStagingEnvironment({
          productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
          requiredResources: ["database", "authUrl", "vectorizeWorker"],
        });
        return {
          stagingConfirmed: guard.environment === "staging",
          mutationAllowed: guard.mutationAllowed,
          resourceFingerprintCount: guard.resources.length,
        };
      },
    },
    {
      stage: "config",
      run: async () => {
        const missing = requiredRemoteKeys();
        if (missing.length > 0) {
          throw new Error(`PEDAGOGY_SHADOW_MISSING_CONFIG:${missing.join(",")}`);
        }
        if (process.env.FEATURE_ZYRA_PEDAGOGY_V3 === "1") {
          throw new Error("PEDAGOGY_STARTUP_FEATURE_FLAG_MUST_REMAIN_DISABLED");
        }
        const maxCases = boundedPedagogyShadowCaseCount(maxProviderRequests);
        if (maxCases < 1) throw new Error("PEDAGOGY_SHADOW_PROVIDER_BUDGET_TOO_SMALL");
        return {
          requiredConfigCount: 15,
          missingConfigCount: 0,
          explicitShadowMode: true,
          publicFeatureFlagEnabled: false,
          maxCases,
          providerCallCap: maxProviderRequests,
        };
      },
    },
    {
      stage: "database_connectivity",
      run: async () => {
        const connection = resolveDatabaseConnection(process.env);
        client = createClient({ url: connection.url, authToken: connection.authToken });
        const ping = await client.execute("SELECT 1 AS ok");
        if (Number(ping.rows[0]?.ok ?? 0) !== 1) {
          throw new Error("PEDAGOGY_STARTUP_DATABASE_PING_FAILED");
        }
        return { connected: true, writeAttempted: false };
      },
    },
    {
      stage: "identity",
      run: async () => {
        if (!client || !userId) throw new Error("PEDAGOGY_SHADOW_IDENTITY_NOT_CONFIGURED");
        const identity = (await client.execute({
          sql: `SELECT u.id, u.role, p.status,
            GROUP_CONCAT(DISTINCT r.code) AS roles
            FROM user u
            JOIN pengguna p ON p.id = u.id
            LEFT JOIN pengguna_peran pr ON pr.pengguna_id = u.id
            LEFT JOIN peran r ON r.id = pr.peran_id
            WHERE u.id = ?
            GROUP BY u.id, u.role, p.status`,
          args: [userId],
        })).rows[0];
        const roles = String(identity?.roles ?? "").split(",").filter(Boolean);
        if (!identity || identity.role !== "student" || identity.status !== "active" || !roles.includes("murid")) {
          throw new Error("PEDAGOGY_SHADOW_IDENTITY_NOT_ACTIVE_MURID");
        }
        return {
          identityHash: opaqueId(userId),
          active: true,
          legacyStudent: true,
          muridRolePresent: true,
        };
      },
    },
    {
      stage: "session_context",
      run: async () => {
        if (!client) throw new Error("PEDAGOGY_STARTUP_DATABASE_UNAVAILABLE");
        const session = (await client.execute({
          sql: `SELECT COUNT(*) AS total FROM session
            WHERE user_id = ? AND expires_at > CAST(strftime('%s', 'now') AS INTEGER)`,
          args: [userId],
        })).rows[0];
        const activeSessionCount = Number(session?.total ?? 0);
        if (activeSessionCount < 1) throw new Error("PEDAGOGY_STARTUP_ACTIVE_SESSION_MISSING");
        return {
          activeSessionAvailable: true,
          activeSessionCount,
          cookieReadAttempted: false,
          directShadowIdentityContext: true,
        };
      },
    },
    {
      stage: "course_resolution",
      run: async () => {
        if (!client) throw new Error("PEDAGOGY_STARTUP_DATABASE_UNAVAILABLE");
        const course = (await client.execute({
          sql: `SELECT m.id AS canonical_id, m.status AS canonical_status
            FROM courses c
            JOIN mata_kuliah m ON m.legacy_course_id = c.id
            WHERE c.id = ?`,
          args: [courseId],
        })).rows[0];
        if (!course || course.canonical_status !== "active") {
          throw new Error("PEDAGOGY_SHADOW_CANONICAL_COURSE_NOT_ACTIVE");
        }
        canonicalCourseId = String(course.canonical_id);
        return {
          legacyCourseResolved: true,
          canonicalCourseActive: true,
          canonicalCourseHash: opaqueId(canonicalCourseId),
        };
      },
    },
    {
      stage: "enrollment",
      run: async () => {
        if (!client || !canonicalCourseId) throw new Error("PEDAGOGY_STARTUP_COURSE_RESOLUTION_FAILED");
        const enrollment = (await client.execute({
          sql: `SELECT
            (SELECT COUNT(*) FROM enrollments
              WHERE user_id = ? AND course_id = ?
              AND expires_at > CAST(strftime('%s', 'now') AS INTEGER)) AS legacy_current,
            (SELECT COUNT(*) FROM pendaftaran_murid
              WHERE pengguna_id = ? AND mata_kuliah_id = ? AND status = 'active'
              AND (end_at IS NULL OR end_at > CAST(strftime('%s', 'now') AS INTEGER))) AS canonical_current`,
          args: [userId, courseId, userId, canonicalCourseId],
        })).rows[0];
        const legacyCurrent = Number(enrollment?.legacy_current ?? 0);
        const canonicalCurrent = Number(enrollment?.canonical_current ?? 0);
        if (legacyCurrent !== 1 || canonicalCurrent !== 1) {
          throw new Error("PEDAGOGY_SHADOW_ENROLLMENT_NOT_CURRENT");
        }
        return { legacyCurrent, canonicalCurrent };
      },
    },
    {
      stage: "canonical_evidence",
      run: async () => {
        if (!client || !canonicalCourseId) throw new Error("PEDAGOGY_STARTUP_COURSE_RESOLUTION_FAILED");
        const published = (await client.execute({
          sql: "SELECT COUNT(*) AS total FROM soal WHERE mata_kuliah_id = ? AND status = 'published'",
          args: [canonicalCourseId],
        })).rows[0];
        const publishedQuestionCount = Number(published?.total ?? 0);
        if (publishedQuestionCount < 1) {
          throw new Error("PEDAGOGY_SHADOW_CANONICAL_QUESTION_EVIDENCE_MISSING");
        }
        return { publishedQuestionCount, providerCallAttempted: false };
      },
    },
    {
      stage: "runtime_env_contract",
      run: async () => {
        const runtime = await import("@/lib/zyra/runtime-env");
        runtime.createZyraRuntimeEnv(process.env);
        return {
          scopedRuntimeEnvValid: true,
          fullApplicationEnvValidationTriggered: false,
          uploadThingRequired: false,
          resendRequired: false,
        };
      },
    },
    {
      stage: "canonical_runtime_import",
      run: async () => {
        const runtime = await import("@/lib/zyra/canonical-runtime");
        if (typeof runtime.retrieveCanonicalEvidence !== "function") {
          throw new Error("PEDAGOGY_STARTUP_CANONICAL_RUNTIME_EXPORT_MISSING");
        }
        return { imported: true, routeInvoked: false, providerCallAttempted: false };
      },
    },
    {
      stage: "tutor_runtime_import",
      run: async () => {
        const runtime = await import("@/lib/tutor-rag");
        if (typeof runtime.askTutorRag !== "function") {
          throw new Error("PEDAGOGY_STARTUP_TUTOR_RUNTIME_EXPORT_MISSING");
        }
        return { imported: true, tutorInvoked: false, providerCallAttempted: false };
      },
    },
  ];

  let diagnostic;
  try {
    diagnostic = await runMaskedPedagogyStartupDiagnostics(steps);
  } finally {
    client?.close();
  }

  const artifact = {
    status: diagnostic.status,
    plan: "007",
    phase: "staging_pedagogy_startup_diagnostics",
    runId,
    requestedCourse: courseId,
    sourceCommit: currentSourceCommit(),
    stagingResourceFingerprints: guard?.resources ?? [],
    failedStage: diagnostic.failedStage,
    reasonCode: diagnostic.reasonCode,
    stages: diagnostic.stages,
    providerCalls: 0,
    providerCallCap: maxProviderRequests,
    databaseWrites: 0,
    traceWrites: 0,
    learnerSideEffects: 0,
    secretsPrinted: false,
    authenticatedUrlsPrinted: false,
  };
  await writeArtifact(runId, "plan-007-pedagogy-startup-diagnostics.json", artifact);
  console.log(JSON.stringify({
    status: artifact.status,
    runId,
    failedStage: artifact.failedStage,
    reasonCode: artifact.reasonCode,
    providerCalls: artifact.providerCalls,
  }));
  if (diagnostic.status !== "passed") process.exitCode = 1;
}

async function runRemoteShadow(
  runId: string,
  course: string,
  maxProviderRequests: number,
  guard: ReturnType<typeof assertStagingEnvironment>,
): Promise<void> {
  const missing = requiredRemoteKeys();
  if (missing.length > 0) {
    throw new Error(`PEDAGOGY_SHADOW_MISSING_CONFIG:${missing.join(",")}`);
  }
  const userId = process.env.STAGING_ZYRA_PEDAGOGY_USER_ID!;
  const identity = await verifyShadowIdentity(userId, course);
  const maxCases = boundedPedagogyShadowCaseCount(maxProviderRequests);
  if (maxCases < 1) throw new Error("PEDAGOGY_SHADOW_PROVIDER_BUDGET_TOO_SMALL");

  const selectedCases = readCases()
    .filter((item) => !item.activeAssessment)
    .slice(0, maxCases);
  if (selectedCases.length === 0) throw new Error("PEDAGOGY_SHADOW_SAFE_CASES_MISSING");

  const { askTutorRag } = await import("@/lib/tutor-rag");
  const caseResults: Array<{
    id: string;
    status: "passed" | "failed";
    failureCode?: string;
    comparison?: PedagogyShadowComparison;
  }> = [];
  const reviewItems: PedagogyHumanReviewDraft["reviewItems"] = [];

  for (const item of selectedCases) {
    const caseId = `shadow-${opaqueId(item.id)}`;
    let reviewOutput: { baselineAnswer: string; candidateAnswer: string } | undefined;
    try {
      const result = await askTutorRag({
        studentId: userId,
        courseId: course,
        question: `Jelaskan strategi konsep dasar untuk latihan ${item.domain} ini tanpa memberi jawaban akhir.`,
        activityKind: "study",
        attemptState: "none",
        answerReleaseState: "released",
        matchState: "none",
        pedagogyAction: item.action,
        previousHintLevel: item.previousHintLevel,
        misconceptionUncertain: item.misconceptionUncertain,
        pedagogyMode: "shadow",
        pedagogyShadowRunId: runId,
        pedagogyShadowCaseId: caseId,
        suppressLearnerSideEffects: true,
        pedagogyShadowObserver: (output) => {
          reviewOutput = output;
        },
      });
      if (!result.pedagogyShadow) {
        throw new Error("PEDAGOGY_SHADOW_COMPARISON_NOT_PRODUCED");
      }
      caseResults.push({ id: caseId, status: "passed", comparison: result.pedagogyShadow });
      if (reviewOutput) {
        reviewItems.push({
          id: caseId,
          inputKind: "synthetic_golden",
          baselineAnswer: reviewOutput.baselineAnswer,
          candidateAnswer: reviewOutput.candidateAnswer,
          rubric: {
            clarity: null,
            scaffolding: null,
            helpfulness: null,
            cognitiveLoad: null,
            understandingOverAnswerReveal: null,
            reviewerNotes: "",
          },
        });
      }
    } catch (error) {
      caseResults.push({ id: caseId, status: "failed", failureCode: safeCode(error) });
    }
  }

  const passedCases = caseResults.filter((item) => item.status === "passed").length;
  const providerCallUpperBound = caseResults.length * PEDAGOGY_SHADOW_PROVIDER_CALL_UPPER_BOUND_PER_CASE;
  const remotePassed = passedCases === caseResults.length
    && reviewItems.length === caseResults.length
    && providerCallUpperBound <= maxProviderRequests;
  const artifact = {
    status: remotePassed ? "partial" : "blocked",
    plan: "007",
    phase: "staging_pedagogy_remote_shadow",
    runId,
    requestedCourse: course,
    sourceCommit: currentSourceCommit(),
    stagingResourceFingerprints: guard.resources,
    identityHash: identity.identityHash,
    canonicalCourseHash: identity.canonicalCourseHash,
    requestedProviderBudget: maxProviderRequests,
    providerCallUpperBound,
    providerCallUpperBoundPerCase: PEDAGOGY_SHADOW_PROVIDER_CALL_UPPER_BOUND_PER_CASE,
    attemptedCases: caseResults.length,
    passedCases,
    failedCases: caseResults.length - passedCases,
    duplicateLearnerVisibleMessages: 0,
    learnerSideEffectsSuppressed: true,
    remoteShadow: {
      status: remotePassed ? "passed" : "failed",
      visibleResponse: "legacy",
    },
    humanReviewStatus: "pending_maintainer_review",
    caseResults,
    secretsPrinted: false,
    authenticatedUrlsPrinted: false,
  };
  await writeArtifact(runId, "plan-007-pedagogy-shadow.json", artifact);
  if (!remotePassed) {
    console.error(JSON.stringify({
      status: artifact.status,
      runId,
      remoteShadow: artifact.remoteShadow.status,
      attemptedCases: artifact.attemptedCases,
      passedCases: artifact.passedCases,
      providerCallUpperBound: artifact.providerCallUpperBound,
      humanReviewStatus: "not_generated",
    }));
    process.exitCode = 1;
    return;
  }
  const reviewDraft = PedagogyHumanReviewDraftSchema.parse({
    status: "pending_maintainer_review",
    plan: "007",
    runId,
    rubricScale: { minimum: 1, maximum: 5, passingAverage: 4 },
    instructions: "A maintainer must score every field from 1 to 5 and add reviewer notes. The implementation model must not fill these ratings.",
    syntheticInputsOnly: true,
    reviewItems,
    secretsPrinted: false,
    authenticatedUrlsPrinted: false,
  });
  await writeArtifact(runId, "plan-007-pedagogy-human-review.json", reviewDraft);
  await writeFile(
    artifactFile(runId, "plan-007-pedagogy-human-review.html"),
    renderPedagogyHumanReviewPage(reviewDraft),
    "utf8",
  );
  console.log(JSON.stringify({
    status: artifact.status,
    runId,
    remoteShadow: artifact.remoteShadow.status,
    attemptedCases: artifact.attemptedCases,
    passedCases: artifact.passedCases,
    providerCallUpperBound: artifact.providerCallUpperBound,
    humanReviewStatus: artifact.humanReviewStatus,
  }));
  if (!remotePassed) process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const course = requiredCliArg(args, "course");
  const maxRequests = Number(args["max-provider-requests"] ?? "40");
  const remoteShadow = args["remote-shadow"] === true || args["remote-shadow"] === "true";
  const startupDiagnosticsOnly = args["startup-diagnostics-only"] === true
    || args["startup-diagnostics-only"] === "true";
  const cases = boundedCases(readCases().filter((item) => item.course === course || course === "tutorial-pka"), maxRequests);

  if (startupDiagnosticsOnly) {
    await runStartupDiagnostics(runId, course, maxRequests);
    return;
  }

  try {
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl", "vectorizeWorker"],
    });
    if (remoteShadow) {
      await runRemoteShadow(runId, course, maxRequests, guard);
      return;
    }
    const caseResults = cases.map((item) => {
      const context = buildPedagogyContext({
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
      const plan = selectTeachingPlan(context);
      const source = {
        id: `v2:idea:${item.id}:1`,
        version: 1,
        kind: item.activeAssessment ? "practice_question" : "ko",
        title: `Materi ${item.domain}`,
        content: `Materi ${item.domain} menjelaskan prinsip umum untuk ${item.id}.`,
        href: `/courses/${item.course}/material`,
      };
      const promptInput = buildPedagogyPromptInput(context, plan, context.explicitTopic, [source]);
      const response = composeSafeTeachingResponse(context, plan, promptInput.evidence, "STAGING_SHADOW_FIXTURE");
      const validation = validateTeachingResponse(response, context, plan, new Map([[source.id, source.version]]));
      return {
        id: item.id,
        selectedState: response.selectedState,
        expectedState: item.expectedState,
        stateCompliant: response.selectedState === item.expectedState,
        valid: validation.valid,
        violationCodes: validation.violations.map((violation) => violation.code),
      };
    });
    const validCount = caseResults.filter((item) => item.valid && item.stateCompliant).length;
    const artifact = {
      status: "partial",
      plan: "007",
      phase: "staging_pedagogy_shadow",
      runId,
      requestedCourse: course,
      sourceCommit: currentSourceCommit(),
      stagingResourceFingerprints: guard.resources,
      fixtureCaseCount: caseResults.length,
      validFixtureCases: validCount,
      providerCalls: 0,
      remoteShadow: {
        status: "not_run",
        reasonCode: "DEDICATED_STAGING_SHADOW_IDENTITY_NOT_PROVIDED",
      },
      humanReviewStatus: "pending_maintainer_review",
      caseResults,
      secretsPrinted: false,
      authenticatedUrlsPrinted: false,
    };
    await writeArtifact(runId, "plan-007-pedagogy-shadow.json", artifact);
    console.log(JSON.stringify({ status: artifact.status, runId, fixtureCaseCount: artifact.fixtureCaseCount, validFixtureCases: artifact.validFixtureCases, providerCalls: artifact.providerCalls, remoteShadow: artifact.remoteShadow.status }));
    process.exitCode = 2;
  } catch (error) {
    const safe = safeGuardError(error);
    const code = safe.code === "STAGING_GUARD_ERROR" ? safeCode(error) : safe.code;
    const remoteArtifactPath = artifactFile(runId, "plan-007-pedagogy-shadow.json");
    const existingRemoteArtifact = remoteShadow
      && existsSync(remoteArtifactPath)
      && readFileSync(remoteArtifactPath, "utf8").includes('"attemptedCases"');
    if (existingRemoteArtifact) {
      await writeArtifact(runId, "plan-007-pedagogy-runtime-error.json", {
        status: "blocked",
        plan: "007",
        phase: "staging_pedagogy_remote_shadow_runtime_error",
        runId,
        reasonCode: code,
        secretsPrinted: false,
        authenticatedUrlsPrinted: false,
      }).catch(() => undefined);
      console.error(JSON.stringify({ status: "blocked", runId, code, detailsPreserved: true, secretsPrinted: false, authenticatedUrlsPrinted: false }));
      process.exitCode = 1;
      return;
    }
    await writeArtifact(runId, "plan-007-pedagogy-shadow.json", {
      status: "blocked",
      plan: "007",
      phase: remoteShadow ? "staging_pedagogy_remote_shadow" : "staging_pedagogy_shadow",
      runId,
      reasonCode: code,
      providerCalls: 0,
      secretsPrinted: false,
      authenticatedUrlsPrinted: false,
    }).catch(() => undefined);
    console.error(JSON.stringify({ status: "blocked", runId, code, message: safe.message, secretsPrinted: false, authenticatedUrlsPrinted: false }));
    process.exitCode = 1;
  }
}

await main();
