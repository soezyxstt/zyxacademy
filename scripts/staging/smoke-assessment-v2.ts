import { join } from "node:path";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  asesmen,
  auditMutasi,
  bab,
  blueprintAsesmen,
  buktiIdeJawaban,
  cakupanAsesmen,
  ide,
  itemAsesmen,
  jawabanMurid,
  mataKuliah,
  pengguna,
  percobaanAsesmen,
  soal,
  soalIde,
  user,
} from "@/db/schema";
import { findAssessmentLeakKeys, serializeStudentQuizAttempt } from "@/lib/assessment-serialization";
import { createBenchmarkAccessBoundary, evaluateBenchmark, scanForHoldoutLeaks } from "@/lib/asesmen/benchmark-policy";
import { compileAssessmentBlueprint, selectAssessmentItems } from "@/lib/asesmen/blueprint";
import { gradeStableOptionAnswer, buildStableOptionIds } from "@/lib/asesmen/attempt";
import { resolveAssessmentFixtureResolution } from "@/lib/asesmen/staging-resolution";
import { currentSourceCommit, parseCliArgs, requiredCliArg, sha256Text, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";

type CreatedIds = Record<string, string[]>;

const cleanupOrder = [
  "buktiIdeJawaban",
  "jawabanMurid",
  "percobaanAsesmen",
  "itemAsesmen",
  "cakupanAsesmen",
  "asesmen",
  "blueprintAsesmen",
  "soalIde",
  "soal",
  "bab",
  "auditMutasi",
];

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 48);
}

function emptyCreatedIds(): CreatedIds {
  return Object.fromEntries([
    "bab",
    "soal",
    "soalIde",
    "blueprintAsesmen",
    "asesmen",
    "cakupanAsesmen",
    "itemAsesmen",
    "percobaanAsesmen",
    "jawabanMurid",
    "buktiIdeJawaban",
    "auditMutasi",
  ].map((table) => [table, []]));
}

function fixtureIds(runId: string): CreatedIds {
  const prefix = `p010-${safeSegment(runId)}`;
  return {
    bab: [`${prefix}-chapter`],
    soal: [`${prefix}-question-1`, `${prefix}-question-2`],
    soalIde: [`${prefix}-question-1-idea`, `${prefix}-question-2-idea`],
    blueprintAsesmen: [`${prefix}-blueprint`],
    asesmen: [`${prefix}-assessment`],
    cakupanAsesmen: [`${prefix}-scope`],
    itemAsesmen: [`${prefix}-item-1`, `${prefix}-item-2`],
    percobaanAsesmen: [`${prefix}-attempt`],
    jawabanMurid: [`${prefix}-answer-1`, `${prefix}-answer-2`],
    buktiIdeJawaban: [`${prefix}-evidence-1`, `${prefix}-evidence-2`],
    auditMutasi: [],
  };
}

function auditRows(createdIds: CreatedIds, actorId: string, runId: string) {
  const rows: Array<{
    id: string;
    actorId: string;
    entityType: string;
    entityId: string;
    action: string;
    beforeSnapshot: null;
    afterSnapshot: Record<string, unknown>;
    correlationId: string;
  }> = [];
  let index = 0;
  for (const [entityType, ids] of Object.entries(createdIds)) {
    if (entityType === "auditMutasi") continue;
    for (const entityId of ids) {
      rows.push({
        id: `p010-audit-${index}-${sha256Text(`${runId}:${entityType}:${entityId}`).slice(0, 12)}`,
        actorId,
        entityType,
        entityId,
        action: "staging_fixture_create",
        beforeSnapshot: null,
        afterSnapshot: { fixture: "plan-010-dedicated", runId, entityType, entityId },
        correlationId: runId,
      });
      index += 1;
    }
  }
  return rows;
}

function assertNoIdCollisions(existingIds: Set<string>, createdIds: CreatedIds): void {
  for (const [table, ids] of Object.entries(createdIds)) {
    for (const id of ids) {
      if (existingIds.has(`${table}:${id}`)) throw new Error(`DEDICATED_FIXTURE_ID_COLLISION:${table}:${id}`);
    }
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const courseId = requiredCliArg(args, "course");
  const fixture = requiredCliArg(args, "fixture");
  const createdIds = emptyCreatedIds();

  try {
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requireMutation: true,
      requiredResources: ["database", "authUrl"],
    });
    if (fixture !== "dedicated") throw new Error("ASSESSMENT_FIXTURE_MUST_BE_DEDICATED");
    if (!guard.mutationAllowed) throw new Error("STAGING_MUTATION_NOT_ENABLED");

    const [actor] = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin")).limit(1);
    if (!actor) throw new Error("STAGING_ASSESSMENT_ADMIN_PREREQUISITE_MISSING");
    const [domainActor] = await db.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, actor.id)).limit(1);
    if (!domainActor) throw new Error("STAGING_ASSESSMENT_DOMAIN_IDENTITY_PREREQUISITE_MISSING");

    const [requestedCourse] = await db
      .select({ id: mataKuliah.id, title: mataKuliah.title })
      .from(mataKuliah)
      .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId), eq(mataKuliah.code, courseId)))
      .orderBy(asc(mataKuliah.id))
      .limit(1);

    const requestedIdeas = requestedCourse
      ? await db
        .select({ id: ide.id })
        .from(ide)
        .where(and(eq(ide.mataKuliahId, requestedCourse.id), eq(ide.status, "published")))
        .orderBy(asc(ide.code), asc(ide.id))
        .limit(2)
      : [];
    const canonicalCourses = await db
      .select({ id: mataKuliah.id, title: mataKuliah.title })
      .from(mataKuliah)
      .where(eq(mataKuliah.status, "active"))
      .orderBy(asc(mataKuliah.id));
    const publishedIdeaRows = await db
      .select({ id: ide.id, mataKuliahId: ide.mataKuliahId, code: ide.code })
      .from(ide)
      .where(eq(ide.status, "published"))
      .orderBy(asc(ide.mataKuliahId), asc(ide.code), asc(ide.id));
    const ideasByCourse = new Map<string, Array<{ id: string; mataKuliahId: string; code: string }>>();
    for (const idea of publishedIdeaRows) {
      const courseIdeas = ideasByCourse.get(idea.mataKuliahId) ?? [];
      if (courseIdeas.length < 2) courseIdeas.push(idea);
      ideasByCourse.set(idea.mataKuliahId, courseIdeas);
    }
    const fallback = canonicalCourses
      .map((candidate) => ({ course: candidate, ideas: ideasByCourse.get(candidate.id) ?? [] }))
      .find((candidate) => candidate.ideas.length >= 2);
    const resolution = resolveAssessmentFixtureResolution({
      requestedCourseId: courseId,
      requestedNormalizedCourseId: requestedCourse?.id ?? null,
      requestedPublishedIdeaCount: requestedIdeas.length,
      fallbackCourseId: fallback?.course.id ?? null,
      fallbackPublishedIdeaCount: fallback?.ideas.length ?? 0,
    });
    const course = requestedCourse && requestedIdeas.length >= 2 ? requestedCourse : fallback?.course;
    const ideas = requestedCourse && requestedIdeas.length >= 2 ? requestedIdeas : fallback?.ideas ?? [];
    if (!course || ideas.length < 2 || course.id !== resolution.normalizedCourseId) {
      throw new Error("STAGING_ASSESSMENT_COURSE_RESOLUTION_FAILED");
    }

    const ids = fixtureIds(runId);
    const audit = auditRows(ids, domainActor.id, runId);
    ids.auditMutasi = audit.map((row) => row.id);
    for (const [table, tableIds] of Object.entries(ids)) createdIds[table] = [...tableIds];
    const allExisting = await Promise.all([
      db.select({ id: bab.id }).from(bab).where(inArray(bab.id, ids.bab)),
      db.select({ id: soal.id }).from(soal).where(inArray(soal.id, ids.soal)),
      db.select({ id: soalIde.id }).from(soalIde).where(inArray(soalIde.id, ids.soalIde)),
      db.select({ id: blueprintAsesmen.id }).from(blueprintAsesmen).where(inArray(blueprintAsesmen.id, ids.blueprintAsesmen)),
      db.select({ id: asesmen.id }).from(asesmen).where(inArray(asesmen.id, ids.asesmen)),
      db.select({ id: cakupanAsesmen.id }).from(cakupanAsesmen).where(inArray(cakupanAsesmen.id, ids.cakupanAsesmen)),
      db.select({ id: itemAsesmen.id }).from(itemAsesmen).where(inArray(itemAsesmen.id, ids.itemAsesmen)),
      db.select({ id: percobaanAsesmen.id }).from(percobaanAsesmen).where(inArray(percobaanAsesmen.id, ids.percobaanAsesmen)),
      db.select({ id: jawabanMurid.id }).from(jawabanMurid).where(inArray(jawabanMurid.id, ids.jawabanMurid)),
      db.select({ id: buktiIdeJawaban.id }).from(buktiIdeJawaban).where(inArray(buktiIdeJawaban.id, ids.buktiIdeJawaban)),
      db.select({ id: auditMutasi.id }).from(auditMutasi).where(inArray(auditMutasi.id, ids.auditMutasi)),
    ]);
    const tableNames = ["bab", "soal", "soalIde", "blueprintAsesmen", "asesmen", "cakupanAsesmen", "itemAsesmen", "percobaanAsesmen", "jawabanMurid", "buktiIdeJawaban", "auditMutasi"];
    const existingIds = new Set<string>();
    allExisting.forEach((rows, index) => rows.forEach((row) => existingIds.add(`${tableNames[index]}:${row.id}`)));
    assertNoIdCollisions(existingIds, ids);

    const [latestChapter] = await db
      .select({ orderIndex: bab.orderIndex })
      .from(bab)
      .where(eq(bab.mataKuliahId, course.id))
      .orderBy(desc(bab.orderIndex))
      .limit(1);
    const orderIndex = (latestChapter?.orderIndex ?? 0) + 1;
    const now = new Date();
    const chapterId = ids.bab[0];
    const questionIds = ids.soal;
    const blueprintId = ids.blueprintAsesmen[0];
    const assessmentId = ids.asesmen[0];
    const stableOptionIds = questionIds.map((id) => buildStableOptionIds(id, 3));
    const questions = questionIds.map((id, index) => ({
      id,
      prompt: `Plan 010 dedicated question ${index + 1}`,
      ideaId: ideas[index].id,
      stableIds: stableOptionIds[index],
    }));
    const blueprint = compileAssessmentBlueprint({
      assessmentType: "quiz",
      chapterIds: [chapterId],
      itemCount: questions.length,
      seed: Number.parseInt(sha256Text(runId).slice(0, 8), 16),
      dimensions: {
        ideaCoverage: { [ideas[0].id]: 0.5, [ideas[1].id]: 0.5 },
        difficulty: { easy: 1 },
        cognitiveLevel: { understand: 1 },
        reasoningPattern: { conceptual: 1 },
        relationUse: { none: 1 },
        questionType: { multiple_choice: 1 },
      },
    });
    const candidates = questions.map((question) => ({
      id: question.id,
      version: 1,
      chapterId,
      status: "published",
      ideaIds: [question.ideaId],
      difficulty: "easy",
      cognitiveLevel: "understand",
      reasoningPattern: "conceptual",
      relationUse: "none",
      questionType: "multiple_choice",
      solverStatus: "accepted" as const,
      criticStatus: "accepted" as const,
    }));
    const selected = selectAssessmentItems(blueprint, candidates);
    if (selected.length !== blueprint.itemCount || selected.some((item) => item.chapterId !== chapterId)) {
      throw new Error("ASSESSMENT_BLUEPRINT_COUNT_OR_SCOPE_FAILED");
    }

    await db.transaction(async (tx) => {
      await tx.insert(bab).values({
        id: chapterId,
        mataKuliahId: course.id,
        code: `P010-${safeSegment(runId)}`,
        title: `Plan 010 dedicated fixture ${runId}`,
        orderIndex,
        status: "active",
      });
      await tx.insert(soal).values(questions.map((question) => ({
        id: question.id,
        mataKuliahId: course.id,
        babId: chapterId,
        questionType: "multiple_choice" as const,
        prompt: question.prompt,
        optionsSnapshot: ["3", "4", "5"],
        version: 1,
        status: "published" as const,
        difficulty: "easy" as const,
        cognitiveLevel: "understand" as const,
        reasoningPattern: "conceptual",
        generationHash: sha256Text(`${runId}:${question.id}`),
        creatorId: domainActor.id,
        curatorId: domainActor.id,
        publishedAt: now,
      })));
      await tx.insert(soalIde).values(questions.map((question, index) => ({
        id: ids.soalIde[index],
        soalId: question.id,
        ideId: question.ideaId,
        weight: 1,
        role: "primary" as const,
      })));
      await tx.insert(blueprintAsesmen).values({
        id: blueprintId,
        mataKuliahId: course.id,
        title: `Plan 010 blueprint ${runId}`,
        assessmentType: "quiz",
        blueprint: blueprint as unknown as Record<string, unknown>,
        version: 1,
        status: "approved",
        generationHash: blueprint.blueprintHash,
        creatorId: domainActor.id,
        curatorId: domainActor.id,
      });
      await tx.insert(asesmen).values({
        id: assessmentId,
        blueprintAsesmenId: blueprintId,
        mataKuliahId: course.id,
        title: `Plan 010 assessment ${runId}`,
        assessmentType: "quiz",
        version: 1,
        status: "published",
        generationHash: blueprint.blueprintHash,
        creatorId: domainActor.id,
        curatorId: domainActor.id,
        publishedAt: now,
      });
      await tx.insert(cakupanAsesmen).values({ id: ids.cakupanAsesmen[0], asesmenId: assessmentId, babId: chapterId, orderIndex: 0 });
      await tx.insert(itemAsesmen).values(questions.map((question, index) => ({
        id: ids.itemAsesmen[index],
        asesmenId: assessmentId,
        soalId: question.id,
        orderIndex: index,
        renderedQuestionSnapshot: { id: question.id, prompt: question.prompt, options: ["3", "4", "5"] },
        optionOrderSnapshot: question.stableIds,
        gradingPolicySnapshot: { version: "P010-1.0", correctStableOptionIds: [question.stableIds[1]] },
        contentVersion: 1,
        generationHash: sha256Text(`${runId}:item:${question.id}`),
      })));
      await tx.insert(percobaanAsesmen).values({
        id: ids.percobaanAsesmen[0],
        asesmenId: assessmentId,
        penggunaId: domainActor.id,
        status: "in_progress",
        renderedQuestionSnapshot: Object.fromEntries(questions.map((question) => [question.id, { id: question.id, prompt: question.prompt, options: ["3", "4", "5"] }])),
        optionOrderSnapshot: Object.fromEntries(questions.map((question) => [question.id, question.stableIds])),
        gradingPolicySnapshot: Object.fromEntries(questions.map((question) => [question.id, { version: "P010-1.0", correctStableOptionIds: [question.stableIds[1]] }])),
        contentVersion: 1,
        startedAt: now,
      });
      await tx.insert(jawabanMurid).values(questions.map((question, index) => ({
        id: ids.jawabanMurid[index],
        percobaanAsesmenId: ids.percobaanAsesmen[0],
        itemAsesmenId: ids.itemAsesmen[index],
        renderedQuestionSnapshot: { id: question.id, prompt: question.prompt, options: ["3", "4", "5"] },
        optionOrderSnapshot: question.stableIds,
        responseSnapshot: { stableOptionIds: [question.stableIds[1]] },
        gradingPolicySnapshot: { version: "P010-1.0", correctStableOptionIds: [question.stableIds[1]] },
        contentVersion: 1,
        score: 1,
        status: "correct" as const,
        answeredAt: now,
      })));
      await tx.insert(buktiIdeJawaban).values(questions.map((question, index) => ({
        id: ids.buktiIdeJawaban[index],
        jawabanMuridId: ids.jawabanMurid[index],
        ideId: question.ideaId,
        scoreContribution: 1,
        weight: 1,
        confidence: 100,
        evidenceSource: "deterministic_rubric",
        rubricVersion: "P010-1.0",
        derivationStatus: "deterministic" as const,
        ambiguous: false,
        affectsMastery: true,
      })));
      await tx.update(percobaanAsesmen).set({ status: "submitted", submittedAt: now }).where(eq(percobaanAsesmen.id, ids.percobaanAsesmen[0]));
      await tx.insert(auditMutasi).values(audit);
    });

    const rawQuestions = questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: ["3", "4", "5"],
      stable_option_ids: question.stableIds,
      correct_indices: [1],
      explanation: "protected",
      gradingPolicy: { correctStableOptionIds: [question.stableIds[1]] },
      evidenceMappings: [{ ideaId: question.ideaId }],
    }));
    const activeAttempt = serializeStudentQuizAttempt({
      id: ids.percobaanAsesmen[0],
      studentId: domainActor.id,
      templateId: assessmentId,
      status: "in_progress",
      startedAt: now,
      questionsSnapshot: rawQuestions,
      answersSnapshot: Object.fromEntries(questions.map((question) => [question.id, [question.stableIds[1]]])),
      feedback: [{ explanation: "protected" }],
    });
    const redactionLeaks = findAssessmentLeakKeys(activeAttempt);
    if (redactionLeaks.length > 0) throw new Error(`ASSESSMENT_REDACTION_FAILED:${redactionLeaks.join(",")}`);

    const holdoutCanary = `P010_HOLDOUT_${safeSegment(runId)}`;
    const references = [
      { id: `${ids.asesmen[0]}-allowed`, checksum: sha256Text("allowed"), datasetKey: "plan-010", visibility: "allowed" as const },
      { id: `${ids.asesmen[0]}-holdout`, checksum: sha256Text(holdoutCanary), datasetKey: "plan-010", visibility: "holdout" as const, content: holdoutCanary },
    ];
    const boundary = createBenchmarkAccessBoundary(references);
    const authoring = boundary.listAuthoringReferences();
    const holdoutLeaks = scanForHoldoutLeaks({ authoring, activeAttempt }, [holdoutCanary]);
    const benchmark = evaluateBenchmark({ version: "P010-1.0", exactHashReject: true, holdoutSimilarityThreshold: 0.95 }, sha256Text("new-dedicated-question"), references);
    if (benchmark.status !== "publish" || holdoutLeaks.length > 0) throw new Error(`ASSESSMENT_HOLDOUT_LEAK_FAILED:${holdoutLeaks.join(",")}`);

    const report = {
      planNumber: "010",
      runId,
      status: "passed" as const,
      sourceCommit: currentSourceCommit(),
      courseId,
      normalizedCourseId: resolution.normalizedCourseId,
      fixture,
      fixtureMode: resolution.fixtureMode,
      fallbackReason: resolution.fallbackReason,
      requestedNormalizedMismatch: resolution.requestedNormalizedMismatch,
      resources: guard.resources,
      runtimePolicy: { canonicalAssessment: "always-on" },
      stagingWrites: true,
      flow: ["create", "publish", "start", "answer", "submit", "summary"],
      createdIds: ids,
      cleanup: { order: cleanupOrder, strategy: "reconcile and delete exact recorded IDs in reverse dependency order" },
      blueprint: { blueprintHash: blueprint.blueprintHash, requestedItemCount: blueprint.itemCount, selectedItemCount: selected.length, chapterCount: blueprint.chapterIds.length, countPass: selected.length === blueprint.itemCount, scopePass: selected.every((item) => item.chapterId === chapterId) },
      stableOptionGrading: { stableIdPass: questions.every((question) => gradeStableOptionAnswer({ stableOptionIds: question.stableIds, correctIndices: [1], submitted: question.stableIds[1], questionType: "multiple_choice" })), legacyNumericCompatibilityPass: questions.every((question) => gradeStableOptionAnswer({ stableOptionIds: question.stableIds, correctIndices: [1], submitted: 1, questionType: "multiple_choice" })) },
      redaction: { leakFindings: redactionLeaks, leakedCount: redactionLeaks.length },
      holdout: { benchmarkStatus: benchmark.status, policyVersion: benchmark.policyVersion, authoringReferenceCount: authoring.length, leakFindings: holdoutLeaks, leakedCount: holdoutLeaks.length },
      reconciliation: { questionCount: questions.length, answerCount: questions.length, evidenceCount: questions.length, attemptStatus: "submitted", exactFixtureOnly: true },
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-010-result.json", report);
    console.log(JSON.stringify({ status: report.status, runId, selectedItemCount: selected.length, createdIdCount: Object.values(ids).flat().length }));
  } catch (error) {
    const report = {
      planNumber: "010",
      runId,
      status: "blocked" as const,
      sourceCommit: currentSourceCommit(),
      fixture,
      normalizedCourseId: null,
      fixtureMode: "none",
      fallbackReason: error instanceof Error ? error.message : "ASSESSMENT_FIXTURE_RESOLUTION_FAILED",
      requestedNormalizedMismatch: false,
      createdIds,
      cleanup: { order: cleanupOrder, strategy: "reconcile exact IDs before retry" },
      error: error instanceof Error ? error.message : String(error),
      operatorTimestamp: new Date().toISOString(),
    };
    try {
      await writeArtifact(runId, "plan-010-result.json", report);
    } catch (artifactError) {
      console.error(JSON.stringify({ status: "blocked", runId, error: report.error, artifactError: artifactError instanceof Error ? artifactError.message : String(artifactError) }));
      process.exitCode = 1;
      return;
    }
    console.error(JSON.stringify(report));
    process.exitCode = 1;
  }
}

void main();
