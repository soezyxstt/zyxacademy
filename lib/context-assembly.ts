import { KnowledgeService } from "./knowledge-service";
import { db } from "@/db";
import { aiQuestionBank } from "@/db/schema";
import { eq } from "drizzle-orm";
import { traceRootCause } from "./graph-trace";

export interface ConceptContextVars {
  title: string;
  conceptName: string;
  type: string;
  content: string;
  difficulty: string;
  bloomLevel: string;
  relatedConcepts: string[];
  /** EIF E5: deterministic prerequisite root-cause block injected when the chain is non-empty. */
  rootCause?: string;
}

/** EIF E5: formats a root-cause chain into a short tutor-context block. */
export function formatRootCauseBlock(
  conceptName: string,
  chain: Array<{ concept: string; mastery: number }>,
  estimatedMinutes: number,
): string {
  const list = chain.map((c) => `${c.concept} (${c.mastery})`).join(", ");
  return `Student is weak on ${conceptName}. Likely root cause in prerequisites: ${list}. If the question depends on these, address the prerequisite first. Estimated review about ${estimatedMinutes} minutes.`;
}

export interface MistakeContextVars {
  questionPrompt: string;
  options: string[];
  correctOption: string;
  studentAnswer: string;
  conceptTitle: string;
  conceptContent: string;
}

export class ContextAssembly {
  /**
   * Compiles context variables for explaining a Knowledge Object.
   */
  static async explainConcept(koId: string, studentId: string): Promise<ConceptContextVars> {
    const ko = await KnowledgeService.getKO(koId);
    if (!ko) throw new Error(`Knowledge Object not found: ${koId}`);

    const related = await KnowledgeService.getRelatedKOs(koId);
    const relatedTitles = related.map(r => r.title);

    // E5: inject deterministic prerequisite root cause when the chain is non-empty.
    let rootCause: string | undefined;
    if (ko.courseId) {
      try {
        const trace = await traceRootCause(studentId, ko.courseId, ko.conceptName);
        if (trace.chain.length > 0) {
          rootCause = formatRootCauseBlock(ko.conceptName, trace.chain, trace.estimatedMinutes);
        }
      } catch (err) {
        console.error("traceRootCause failed in explainConcept:", err);
      }
    }

    return {
      title: ko.title,
      conceptName: ko.conceptName,
      type: ko.type || "definition",
      content: ko.content,
      difficulty: ko.difficulty || "medium",
      bloomLevel: ko.bloomLevel || "understand",
      relatedConcepts: relatedTitles,
      ...(rootCause ? { rootCause } : {}),
    };
  }

  /**
   * Compiles context variables for analyzing a student's incorrect quiz answer.
   */
  static async analyzeMistake(
    questionId: string,
    selectedIndex: number,
    _studentId: string
  ): Promise<MistakeContextVars> {
    // 1. Fetch question details from bank
    const [question] = await db
      .select()
      .from(aiQuestionBank)
      .where(eq(aiQuestionBank.id, questionId));

    if (!question) throw new Error(`Question not found: ${questionId}`);

    const options = (question.options as string[]) || [];
    const correctIndices = (question.correctIndices as number[]) || [];
    const correctOptionText = correctIndices.map(idx => options[idx]).join(", ");
    const studentAnswerText = selectedIndex === -1 ? "(Tidak menjawab / diskusi umum)" : (options[selectedIndex] || "No Answer Selected");

    // 2. Fetch associated KO details
    let conceptTitle = "Unknown Concept";
    let conceptContent = "";
    if (question.knowledgeObjectId) {
      const ko = await KnowledgeService.getKO(question.knowledgeObjectId);
      if (ko) {
        conceptTitle = ko.title;
        conceptContent = ko.content;
      }
    }

    return {
      questionPrompt: question.prompt,
      options,
      correctOption: correctOptionText,
      studentAnswer: studentAnswerText,
      conceptTitle,
      conceptContent,
    };
  }
}
