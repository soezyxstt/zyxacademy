import { createClient } from "@libsql/client";
import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { assertStagingEnvironment, parseEnvFile, resolveDatabaseConnection } from "@/lib/staging/staging-guard";
import { type IdeaEvidence } from "@/lib/pemahaman/engine";

export type StagingIdeaDb = ReturnType<typeof drizzle<typeof schema>>;

export type CourseResolution = {
  requestedCourseId: string;
  normalizedCourseId: string;
  ideaIds: string[];
  fixtureMode: "requested_course" | "dedicated_canonical_fallback";
  fallbackReason: string | null;
};

export type EvidenceGroup = {
  penggunaId: string;
  ideId: string;
  evidence: IdeaEvidence[];
};

export function openStagingIdeaDb(requireMutation = false): { client: ReturnType<typeof createClient>; db: StagingIdeaDb } {
  assertStagingEnvironment({
    productionEnv: parseEnvFile(`${process.cwd()}/.env.prod`),
    requireMutation,
    requiredResources: ["database", "authUrl"],
  });
  const client = createClient(resolveDatabaseConnection(process.env));
  return { client, db: drizzle(client, { schema }) };
}

export async function resolveCourse(db: StagingIdeaDb, requestedCourseId: string): Promise<CourseResolution> {
  const requestedIdeas = await db
    .select({ id: schema.ide.id })
    .from(schema.ide)
    .where(and(eq(schema.ide.mataKuliahId, requestedCourseId), eq(schema.ide.status, "published")))
    .orderBy(asc(schema.ide.id));

  if (requestedIdeas.length > 0) {
    return {
      requestedCourseId,
      normalizedCourseId: requestedCourseId,
      ideaIds: requestedIdeas.map((row) => row.id),
      fixtureMode: "requested_course",
      fallbackReason: null,
    };
  }

  const publishedIdeas = await db
    .select({ courseId: schema.ide.mataKuliahId, ideaId: schema.ide.id })
    .from(schema.ide)
    .where(eq(schema.ide.status, "published"))
    .orderBy(asc(schema.ide.mataKuliahId), asc(schema.ide.id));
  const fallbackCourseId = publishedIdeas[0]?.courseId;
  if (!fallbackCourseId) throw new Error("PLAN_011_NO_PUBLISHED_IDEAS");

  return {
    requestedCourseId,
    normalizedCourseId: fallbackCourseId,
    ideaIds: publishedIdeas.filter((row) => row.courseId === fallbackCourseId).map((row) => row.ideaId),
    fixtureMode: "dedicated_canonical_fallback",
    fallbackReason: "REQUESTED_COURSE_HAS_NO_PUBLISHED_IDEAS",
  };
}

export async function loadEvidenceGroups(db: StagingIdeaDb, ideaIds: string[]): Promise<EvidenceGroup[]> {
  if (ideaIds.length === 0) return [];
  const learningRows = await db
    .select()
    .from(schema.buktiPembelajaran)
    .where(inArray(schema.buktiPembelajaran.ideId, ideaIds))
    .orderBy(asc(schema.buktiPembelajaran.penggunaId), asc(schema.buktiPembelajaran.ideId), asc(schema.buktiPembelajaran.occurredAt));
  const answerRows = await db
    .select({
      id: schema.buktiIdeJawaban.id,
      ideaId: schema.buktiIdeJawaban.ideId,
      penggunaId: schema.percobaanAsesmen.penggunaId,
      sourceId: schema.jawabanMurid.id,
      evidenceSource: schema.buktiIdeJawaban.evidenceSource,
      scoreContribution: schema.buktiIdeJawaban.scoreContribution,
      weight: schema.buktiIdeJawaban.weight,
      confidence: schema.buktiIdeJawaban.confidence,
      derivationStatus: schema.buktiIdeJawaban.derivationStatus,
      ambiguous: schema.buktiIdeJawaban.ambiguous,
      affectsMastery: schema.buktiIdeJawaban.affectsMastery,
      occurredAt: schema.jawabanMurid.answeredAt,
      rubricVersion: schema.buktiIdeJawaban.rubricVersion,
    })
    .from(schema.buktiIdeJawaban)
    .innerJoin(schema.jawabanMurid, eq(schema.buktiIdeJawaban.jawabanMuridId, schema.jawabanMurid.id))
    .innerJoin(schema.percobaanAsesmen, eq(schema.jawabanMurid.percobaanAsesmenId, schema.percobaanAsesmen.id))
    .where(inArray(schema.buktiIdeJawaban.ideId, ideaIds))
    .orderBy(asc(schema.percobaanAsesmen.penggunaId), asc(schema.buktiIdeJawaban.ideId), asc(schema.jawabanMurid.answeredAt));

  const grouped = new Map<string, EvidenceGroup>();
  const add = (penggunaId: string, ideId: string, evidence: IdeaEvidence) => {
    const key = `${penggunaId}:${ideId}`;
    const current = grouped.get(key) ?? { penggunaId, ideId, evidence: [] };
    current.evidence.push(evidence);
    grouped.set(key, current);
  };

  for (const row of learningRows) {
    add(row.penggunaId, row.ideId, {
      id: row.id,
      ideaId: row.ideId,
      sourceId: row.sourceId,
      evidenceSource: row.evidenceSource,
      scoreContribution: row.scoreContribution,
      confidence: row.confidence,
      derivationStatus: row.derivationStatus,
      ambiguous: row.ambiguous,
      affectsMastery: row.affectsMastery,
      occurredAt: row.occurredAt,
      rubricVersion: row.rubricVersion,
    });
  }
  for (const row of answerRows) {
    add(row.penggunaId, row.ideaId, {
      id: row.id,
      ideaId: row.ideaId,
      sourceId: row.sourceId,
      evidenceSource: row.evidenceSource,
      scoreContribution: row.scoreContribution,
      weight: row.weight,
      confidence: row.confidence,
      derivationStatus: row.derivationStatus,
      ambiguous: row.ambiguous,
      affectsMastery: row.affectsMastery,
      occurredAt: row.occurredAt,
      rubricVersion: row.rubricVersion,
    });
  }

  return [...grouped.values()].sort((left, right) => `${left.penggunaId}:${left.ideId}`.localeCompare(`${right.penggunaId}:${right.ideId}`));
}
