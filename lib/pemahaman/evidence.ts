import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { inngest } from "@/lib/inngest";
import {
  buktiIdeJawaban,
  buktiPembelajaran,
  ide,
  jawabanMurid,
  pemahamanIde,
  perubahanPemahaman,
  percobaanAsesmen,
} from "@/db/schema";
import {
  computeIdeaMastery,
  hashIdeaMasteryState,
  PEMAHAMAN_RUBRIC_VERSION,
  type EvidenceDerivationStatus,
  type IdeaEvidence,
  type IdeaMasteryState,
} from "./engine";

export type LearningEvidenceInput = {
  penggunaId: string;
  ideId: string;
  evidenceSource: string;
  sourceId: string;
  scoreContribution: number;
  confidence: number;
  rubricVersion?: string;
  derivationStatus: Extract<EvidenceDerivationStatus, "verified" | "deterministic" | "reviewed" | "ambiguous" | "rejected">;
  ambiguous?: boolean;
  affectsMastery: boolean;
  occurredAt: Date;
};

export type IdeaMasteryRecomputeResult = {
  state: IdeaMasteryState;
  stateHash: string;
  changed: boolean;
  changeId: string | null;
};

function stableId(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 40);
}

export function learningEvidenceIdentity(input: LearningEvidenceInput): string {
  return [input.penggunaId, input.evidenceSource, input.sourceId, input.ideId, input.rubricVersion ?? PEMAHAMAN_RUBRIC_VERSION].join("|");
}

function evidenceId(input: LearningEvidenceInput): string {
  return `bukti-${stableId(
    learningEvidenceIdentity(input),
  )}`;
}

function asIdeaEvidence(row: typeof buktiPembelajaran.$inferSelect): IdeaEvidence {
  return {
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
  };
}

export async function recordLearningEvidence(input: LearningEvidenceInput): Promise<{ id: string; inserted: boolean }> {
  if (input.ambiguous && input.affectsMastery) {
    throw new Error("ambiguous evidence cannot affect mastery");
  }

  const rubricVersion = input.rubricVersion ?? PEMAHAMAN_RUBRIC_VERSION;
  const id = evidenceId({ ...input, rubricVersion });
  const inserted = await db
    .insert(buktiPembelajaran)
    .values({
      id,
      penggunaId: input.penggunaId,
      ideId: input.ideId,
      evidenceSource: input.evidenceSource,
      sourceId: input.sourceId,
      scoreContribution: input.scoreContribution,
      confidence: Math.round(Math.min(100, Math.max(0, input.confidence))),
      rubricVersion,
      derivationStatus: input.derivationStatus === "verified" ? "reviewed" : input.derivationStatus,
      ambiguous: input.ambiguous ?? false,
      affectsMastery: input.affectsMastery,
      occurredAt: input.occurredAt,
    })
    .onConflictDoNothing()
    .returning({ id: buktiPembelajaran.id });

  const wasInserted = inserted.length > 0;
  if (wasInserted) {
    await requestIdeaMasteryRecompute({
      penggunaId: input.penggunaId,
      ideId: input.ideId,
      evidenceId: id,
    });
  }
  return { id, inserted: wasInserted };
}

export async function requestIdeaMasteryRecompute(input: {
  penggunaId: string;
  ideId: string;
  evidenceId?: string;
}): Promise<void> {
  try {
    await inngest.send({
      name: "mastery/idea-recompute.requested.v1",
      data: {
        studentId: input.penggunaId,
        ideaId: input.ideId,
        evidenceId: input.evidenceId ?? null,
        idempotencyKey: `${input.penggunaId}:${input.ideId}:${input.evidenceId ?? "replay"}`,
      },
    });
  } catch (error) {
    console.error("Failed to trigger per-Idea mastery recompute:", error);
  }
}

async function loadLearningEvidence(penggunaId: string, ideId: string): Promise<IdeaEvidence[]> {
  const learningRows = await db
    .select()
    .from(buktiPembelajaran)
    .where(and(eq(buktiPembelajaran.penggunaId, penggunaId), eq(buktiPembelajaran.ideId, ideId)))
    .orderBy(asc(buktiPembelajaran.occurredAt), asc(buktiPembelajaran.id));

  const answerRows = await db
    .select({
      id: buktiIdeJawaban.id,
      ideaId: buktiIdeJawaban.ideId,
      sourceId: jawabanMurid.id,
      evidenceSource: buktiIdeJawaban.evidenceSource,
      scoreContribution: buktiIdeJawaban.scoreContribution,
      weight: buktiIdeJawaban.weight,
      confidence: buktiIdeJawaban.confidence,
      derivationStatus: buktiIdeJawaban.derivationStatus,
      ambiguous: buktiIdeJawaban.ambiguous,
      affectsMastery: buktiIdeJawaban.affectsMastery,
      occurredAt: jawabanMurid.answeredAt,
      rubricVersion: buktiIdeJawaban.rubricVersion,
    })
    .from(buktiIdeJawaban)
    .innerJoin(jawabanMurid, eq(buktiIdeJawaban.jawabanMuridId, jawabanMurid.id))
    .innerJoin(percobaanAsesmen, eq(jawabanMurid.percobaanAsesmenId, percobaanAsesmen.id))
    .where(and(eq(percobaanAsesmen.penggunaId, penggunaId), eq(buktiIdeJawaban.ideId, ideId)))
    .orderBy(asc(jawabanMurid.answeredAt), asc(buktiIdeJawaban.id));

  return [
    ...learningRows.map(asIdeaEvidence),
    ...answerRows.map((row) => ({
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
    })),
  ].sort((a, b) => {
    const timeDelta = a.occurredAt.getTime() - b.occurredAt.getTime();
    return timeDelta === 0 ? a.id.localeCompare(b.id) : timeDelta;
  });
}

export async function recomputeIdeaMastery(
  penggunaId: string,
  ideId: string,
  options: { asOf?: Date; reason?: string } = {},
): Promise<IdeaMasteryRecomputeResult> {
  const state = computeIdeaMastery(ideId, await loadLearningEvidence(penggunaId, ideId), options.asOf ?? new Date());
  const stateHash = hashIdeaMasteryState(state);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(pemahamanIde)
      .where(and(eq(pemahamanIde.penggunaId, penggunaId), eq(pemahamanIde.ideId, ideId)))
      .limit(1);

    const changed =
      !existing ||
      existing.skor !== state.score ||
      existing.keyakinan !== state.confidence ||
      existing.evidenceCount !== state.evidenceCount ||
      existing.algorithmVersion !== state.algorithmVersion ||
      existing.inputWatermark !== state.inputWatermark;
    const masteryId = existing?.id ?? `pemahaman-${stableId(`${penggunaId}|${ideId}`)}`;
    const version = changed ? (existing?.version ?? 0) + 1 : existing.version;

    if (!existing) {
      await tx.insert(pemahamanIde).values({
        id: masteryId,
        penggunaId,
        ideId,
        skor: state.score,
        keyakinan: state.confidence,
        evidenceCount: state.evidenceCount,
        version,
        algorithmVersion: state.algorithmVersion,
        inputWatermark: state.inputWatermark,
        updatedAt: now,
        createdAt: now,
      });
    } else if (changed) {
      await tx
        .update(pemahamanIde)
        .set({
          skor: state.score,
          keyakinan: state.confidence,
          evidenceCount: state.evidenceCount,
          version,
          algorithmVersion: state.algorithmVersion,
          inputWatermark: state.inputWatermark,
          updatedAt: now,
        })
        .where(eq(pemahamanIde.id, existing.id));
    }

    if (!changed) {
      return { state, stateHash, changed: false, changeId: null };
    }

    const changeId = `perubahan-${stableId(`${masteryId}|${state.inputWatermark}|${stateHash}`)}`;
    await tx
      .insert(perubahanPemahaman)
      .values({
        id: changeId,
        pemahamanIdeId: masteryId,
        evidenceId: null,
        previousScore: existing?.skor ?? 0,
        nextScore: state.score,
        previousConfidence: existing?.keyakinan ?? 0,
        nextConfidence: state.confidence,
        reason: options.reason ?? (existing ? "idea_mastery_recompute" : "idea_mastery_initial_replay"),
        evidenceIds: state.evidenceIds,
        algorithmVersion: state.algorithmVersion,
        inputWatermark: state.inputWatermark,
        createdAt: now,
      })
      .onConflictDoNothing();

    return { state, stateHash, changed: true, changeId };
  });
}

export async function listPublishedIdeasForCourse(courseId: string) {
  return db
    .select({ id: ide.id })
    .from(ide)
    .where(and(eq(ide.mataKuliahId, courseId), eq(ide.status, "published")))
    .orderBy(asc(ide.id));
}

export async function getStoredIdeaMastery(penggunaId: string, ideId: string) {
  const [row] = await db
    .select()
    .from(pemahamanIde)
    .where(and(eq(pemahamanIde.penggunaId, penggunaId), eq(pemahamanIde.ideId, ideId)))
    .limit(1);
  return row ?? null;
}
