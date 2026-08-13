import type { RetrievalMemory, TutorSource } from "./memory-layers";
import { vectorStore, VECTOR_NAMESPACES } from "@/lib/vector-store";
import { db } from "@/db";
import { knowledgeObjects } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import { retrieveCanonicalEvidence } from "./canonical-runtime";

export interface RetrievalMemoryInput {
  studentId?: string;
  courseId: string;
  chapterId: string | null;
  question: string;
}

export async function getRetrievalMemory(input: RetrievalMemoryInput): Promise<RetrievalMemory> {
  const { courseId, chapterId, question } = input;

  const sources: TutorSource[] = [];

  try {
    if (zyraRuntimeEnv.FEATURE_ZYRA_IDEA_RUNTIME_V1 === "1") {
      const result = await retrieveCanonicalEvidence({
        studentId: input.studentId,
        courseId,
        chapterId,
        isEnrolled: false,
      }, question);
      return {
        sources: result.sources.map((source) => ({
          type: source.type,
          id: source.id,
          label: source.label,
          href: source.href,
        })),
        retrievedAt: new Date(),
        query: question,
      };
    }

    const learningMatches = await vectorStore.query(
      `${courseId}_${VECTOR_NAMESPACES.learning}`,
      question,
      {
        topK: 5,
        ...(chapterId ? { filter: { chapterId } } : {}),
      }
    );

    const relevantLearning = learningMatches.filter((m) => m.score >= 0.5);

    if (relevantLearning.length > 0) {
      const koIds = relevantLearning.map((m) => m.id);

      const koRows = await db
        .select()
        .from(knowledgeObjects)
        .where(
          and(
            inArray(knowledgeObjects.id, koIds),
            eq(knowledgeObjects.status, "active")
          )
        );

      const byId = new Map(koRows.map((ko) => [ko.id, ko]));

      for (const match of relevantLearning) {
        const ko = byId.get(match.id);
        if (ko) {
          sources.push({
            type: "ko",
            id: ko.id,
            label: ko.title,
            href: `/courses/${courseId}/material`,
          });
        }
      }
    }
  } catch (err) {
    console.error("[retrieval-memory] Failed to retrieve vector memory:", err);
  }

  return {
    sources,
    retrievedAt: new Date(),
    query: question,
  };
}
