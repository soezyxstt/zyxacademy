import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  asalIde,
  bab,
  benchmarkSoal,
  ide,
  learningObjectives,
  mataKuliah,
  penugasanTutor,
  pengguna,
  potonganSumber,
  relasiIde,
  soalItbReferensi,
  sumberMateri,
} from "@/db/schema";
import type {
  AuthoringChapter,
  AuthoringContextInput,
  AuthoringExcerpt,
  AuthoringIdea,
  AuthoringObjective,
  AuthoringProvenance,
  AuthoringRelation,
  AuthoringSource,
} from "./context-pack";

export type AuthoringSnapshotOptions = {
  courseId: string;
  snapshotId: string;
  createdAt: string;
  retentionUntil: string;
};

export async function loadAuthoringContextInput(options: AuthoringSnapshotOptions): Promise<AuthoringContextInput> {
  const [course] = await db
    .select({ id: mataKuliah.id, code: mataKuliah.code, title: mataKuliah.title, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, options.courseId), eq(mataKuliah.legacyCourseId, options.courseId)))
    .limit(1);
  if (!course) throw new Error(`AUTHORING_CONTEXT_COURSE_NOT_FOUND:${options.courseId}`);

  const chapterRows = await db
    .select({ id: bab.id, courseId: bab.mataKuliahId, code: bab.code, title: bab.title, orderIndex: bab.orderIndex, legacyChapterId: bab.legacyChapterId })
    .from(bab)
    .where(eq(bab.mataKuliahId, course.id));
  const sourceRows = await db
    .select({ id: sumberMateri.id, courseId: sumberMateri.mataKuliahId, chapterId: sumberMateri.babId, title: sumberMateri.title, version: sumberMateri.version, checksum: sumberMateri.checksum, status: sumberMateri.status, citation: sumberMateri.canonicalUriOrR2Key })
    .from(sumberMateri)
    .where(and(eq(sumberMateri.mataKuliahId, course.id), eq(sumberMateri.status, "active")));
  const sourceIds = sourceRows.map((row) => row.id);
  const ideaRows = await db
    .select()
    .from(ide)
    .where(and(eq(ide.mataKuliahId, course.id), eq(ide.status, "published")));
  const ideaIds = ideaRows.map((row) => row.id);
  const chunkRows = sourceIds.length === 0 ? [] : await db.select().from(potonganSumber).where(inArray(potonganSumber.sumberMateriId, sourceIds));
  const chunkIds = chunkRows.map((row) => row.id);
  const provenanceRows = ideaIds.length === 0 || chunkIds.length === 0
    ? []
    : await db.select().from(asalIde).where(and(inArray(asalIde.ideId, ideaIds), inArray(asalIde.sourceChunkId, chunkIds)));
  const relations = ideaIds.length === 0
    ? []
    : await db.select().from(relasiIde).where(and(inArray(relasiIde.sourceIdeaId, ideaIds), inArray(relasiIde.targetIdeaId, ideaIds)));

  const legacyCourseId = course.legacyCourseId ?? course.id;
  const legacyChapterIds = chapterRows.map((row) => row.legacyChapterId ?? row.id);
  const objectiveRows = legacyChapterIds.length === 0
    ? []
    : await db.select().from(learningObjectives).where(and(eq(learningObjectives.courseId, legacyCourseId), inArray(learningObjectives.chapterId, legacyChapterIds), eq(learningObjectives.status, "active")));
  const benchmarkRows = await db
    .select({ benchmark: benchmarkSoal, reference: soalItbReferensi })
    .from(benchmarkSoal)
    .leftJoin(soalItbReferensi, eq(soalItbReferensi.id, benchmarkSoal.soalItbReferensiId));

  const chapters: AuthoringChapter[] = chapterRows.map((row) => ({ id: row.id, courseId: row.courseId, code: row.code, title: row.title, orderIndex: row.orderIndex }));
  const sources: AuthoringSource[] = sourceRows.map((row) => ({ id: row.id, courseId: row.courseId, chapterId: row.chapterId, title: row.title, version: row.version, checksum: row.checksum, status: row.status, citation: row.citation }));
  const ideas: AuthoringIdea[] = ideaRows.map((row) => ({
    id: row.id,
    courseId: row.mataKuliahId,
    chapterId: row.babId,
    stableKey: row.stableKey,
    code: row.code,
    canonicalStatement: row.canonicalStatement,
    conciseExplanation: row.conciseExplanation,
    latex: row.latex,
    knowledgeKind: row.knowledgeKind,
    instructionalRole: row.instructionalRole,
    difficultyMetadata: row.difficultyMetadata,
    version: row.version,
    status: row.status,
    sourcePolicy: row.sourcePolicy,
    semanticHash: row.semanticHash,
    generationHash: row.generationHash,
    reviewed: true,
  }));
  const excerpts: AuthoringExcerpt[] = chunkRows.map((row) => ({ id: row.id, sourceId: row.sumberMateriId, sourceVersion: row.sourceVersion, content: row.content, startOffset: row.startOffset, endOffset: row.endOffset, sectionLocator: row.sectionLocator, pageNumber: row.pageNumber, checksum: row.checksum }));
  const provenance: AuthoringProvenance[] = provenanceRows.map((row) => ({ id: row.id, ideaId: row.ideId, excerptId: row.sourceChunkId, role: row.provenanceRole, startOffset: row.startOffset, endOffset: row.endOffset, sourceChecksum: row.sourceChecksum }));
  const authoringRelations: AuthoringRelation[] = relations.map((row) => ({ id: row.id, sourceIdeaId: row.sourceIdeaId, targetIdeaId: row.targetIdeaId, relationType: row.relationType, explanation: row.explanation, version: row.version }));
  const objectives: AuthoringObjective[] = objectiveRows.map((row) => ({ id: row.id, courseId: course.id, chapterId: chapterRows.find((chapter) => (chapter.legacyChapterId ?? chapter.id) === row.chapterId)?.id ?? row.chapterId, objectiveText: row.objectiveText, bloomLevel: row.bloomLevel, relatedIdeaIds: Array.isArray(row.relatedKoIds) ? row.relatedKoIds.map(String) : [] }));
  const requirements = objectives.map((objective) => ({ id: objective.id, kind: "learning_objective", text: objective.objectiveText, chapterId: objective.chapterId }));
  const benchmarks = benchmarkRows.map(({ benchmark, reference }) => ({
    id: benchmark.id,
    datasetKey: benchmark.datasetKey,
    authoringVisibility: benchmark.authoringVisibility,
    version: benchmark.version,
    checksum: benchmark.checksum,
    status: benchmark.status,
    summary: reference?.sourceLabel ?? benchmark.datasetKey,
  }));

  return {
    snapshotId: options.snapshotId,
    createdAt: options.createdAt,
    retentionUntil: options.retentionUntil,
    course: { id: course.id, code: course.code, title: course.title },
    chapters,
    ideas,
    sources,
    excerpts,
    provenance,
    relations: authoringRelations,
    objectives,
    requirements,
    benchmarks,
  };
}

export async function assignedCourseIdsForTutor(userId: string): Promise<string[]> {
  const rows = await db.select({ courseId: penugasanTutor.mataKuliahId }).from(penugasanTutor).innerJoin(pengguna, eq(pengguna.id, penugasanTutor.penggunaId)).where(and(eq(penugasanTutor.penggunaId, userId), eq(penugasanTutor.status, "active"), eq(pengguna.status, "active")));
  return rows.map((row) => row.courseId);
}
