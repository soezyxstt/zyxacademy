import type { RetrievalMemory } from "./memory-layers";
import { retrieveCanonicalEvidence } from "./canonical-runtime";

export interface RetrievalMemoryInput {
  studentId?: string;
  courseId: string;
  chapterId: string | null;
  question: string;
}

export async function getRetrievalMemory(input: RetrievalMemoryInput): Promise<RetrievalMemory> {
  const { courseId, chapterId, question } = input;

  try {
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
  } catch (err) {
    console.error("[retrieval-memory] Failed to retrieve canonical memory:", err);
  }

  return {
    sources: [],
    retrievedAt: new Date(),
    query: question,
  };
}
