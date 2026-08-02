import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pemahamanIde, studentConceptMastery } from "@/db/schema";

export type IdeaMasteryRead =
  | {
      source: "idea";
      label: "Idea mastery";
      score: number;
      confidence: number;
      evidenceCount: number;
      inputWatermark: string;
      algorithmVersion: string;
    }
  | {
      source: "concept_baseline";
      label: "concept-level baseline";
      score: number;
      confidence: number;
      evidenceCount: number;
      inputWatermark: null;
      algorithmVersion: null;
    }
  | {
      source: "unknown";
      label: "unknown";
      score: null;
      confidence: null;
      evidenceCount: 0;
      inputWatermark: null;
      algorithmVersion: null;
    };

export function resolveIdeaMasteryRecord(input: {
  idea: { skor: number; keyakinan: number; evidenceCount: number; inputWatermark: string; algorithmVersion: string } | null;
  baseline: { masteryScore: number; confidence: number; evidenceCount: number } | null;
  legacyConceptName?: string;
}): IdeaMasteryRead {
  if (input.idea) {
    return {
      source: "idea",
      label: "Idea mastery",
      score: input.idea.skor,
      confidence: input.idea.keyakinan,
      evidenceCount: input.idea.evidenceCount,
      inputWatermark: input.idea.inputWatermark,
      algorithmVersion: input.idea.algorithmVersion,
    };
  }

  if (input.legacyConceptName && input.baseline) {
    return {
      source: "concept_baseline",
      label: "concept-level baseline",
      score: input.baseline.masteryScore,
      confidence: input.baseline.confidence,
      evidenceCount: input.baseline.evidenceCount,
      inputWatermark: null,
      algorithmVersion: null,
    };
  }

  return {
    source: "unknown",
    label: "unknown",
    score: null,
    confidence: null,
    evidenceCount: 0,
    inputWatermark: null,
    algorithmVersion: null,
  };
}

export async function getIdeaMasteryWithFallback(
  penggunaId: string,
  ideId: string,
  legacyConceptName?: string,
): Promise<IdeaMasteryRead> {
  const [ideaRow] = await db
    .select()
    .from(pemahamanIde)
    .where(and(eq(pemahamanIde.penggunaId, penggunaId), eq(pemahamanIde.ideId, ideId)))
    .limit(1);

  const [baseline] = legacyConceptName
    ? await db
        .select()
        .from(studentConceptMastery)
        .where(and(eq(studentConceptMastery.studentId, penggunaId), eq(studentConceptMastery.conceptName, legacyConceptName)))
        .limit(1)
    : [];

  return resolveIdeaMasteryRecord({ idea: ideaRow ?? null, baseline: baseline ?? null, legacyConceptName });
}
