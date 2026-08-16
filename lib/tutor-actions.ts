import { db } from "@/db";
import { flashcards, aiQuestionBank, enrollments, chapters, studentChapterProgress } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { KnowledgeService } from "./knowledge-service";
import { AnalyticsService } from "./analytics-service";
import { ContextAssembly } from "./context-assembly";
import { PromptExecutor } from "./prompt-executor";
import { tutorExplainConcept, tutorAnalyzeMistake } from "@/prompts/tutor";
import { generateQuestionsForKO } from "@/lib/question-generator";
import { askTutorRag } from "@/lib/tutor-rag";
import { USE_CASES } from "@/lib/ai-router";
import { z } from "zod";

// Ephemeral exact-match cache for MVP to avoid database footprint growth
const explanationCache = new Map<string, any>();

const ExplainConceptSchema = z.object({
  analogy: z.string(),
  simplification: z.string(),
  commonMisconception: z.string(),
});

const AnalyzeMistakeSchema = z.object({
  detectedMisconception: z.string(),
  mathematicalError: z.string(),
  socraticGuidance: z.string(),
});

export class TutorActionService {
  /**
   * Translates the concept coordinates into a slug redirect path.
   * Outcome: Redirects browser to textbook and scrolls to target section.
   */
  static async openMaterial(chapterId: string, sectionId: string): Promise<{ redirectUrl: string }> {
    return {
      redirectUrl: `/courses/chapter-${chapterId}/material#section-${sectionId}`,
    };
  }

  /**
   * Retrieves active cards linked to the target KO.
   * Outcome: Launches the flashcard deck focusing on Box 1 cards.
   */
  static async startFlashcardReview(koId: string, _studentId: string): Promise<{ deckId: string; cardsCount: number }> {
    const cardsList = await db
      .select()
      .from(flashcards)
      .where(eq(flashcards.koId, koId));

    return {
      deckId: koId,
      cardsCount: cardsList.length,
    };
  }

  /**
   * Queries existing questions matching the KO. If count is low, triggers the Prompt Executor.
   * Outcome: Launches a 3-question practice quiz modal.
   */
  static async generatePracticeQuiz(koId: string, _difficulty: string): Promise<{ quizId: string }> {
    const existing = await db
      .select()
      .from(aiQuestionBank)
      .where(
        and(
          eq(aiQuestionBank.knowledgeObjectId, koId),
          eq(aiQuestionBank.status, "active")
        )
      );

    if (existing.length < 3) {
      console.log(`[Practice Quiz] Existing questions count (${existing.length}) is low. Triggering generation...`);
      const genResult = await generateQuestionsForKO(koId);
      if (!genResult.success) {
        console.warn(`[Practice Quiz] AI Question Generation failed: ${genResult.errors.join("; ")}`);
      }
    }

    return {
      quizId: `practice-${koId}-${Date.now()}`,
    };
  }

  /**
   * Queries weak concepts mapped to student ID.
   * Outcome: Redirects the student to their profile dashboard.
   */
  static async reviewWeakConcepts(_studentId: string): Promise<{ sectionId: string }> {
    return {
      sectionId: "dashboard-weak-concepts-panel",
    };
  }

  /**
   * Gathers weak concepts, traverses graph, and outputs a formatted plan card.
   * Outcome: Renders an interactive roadmap widget inside the side drawer.
   */
  static async buildStudyPlan(studentId: string): Promise<{ plan: string[] }> {
    const plan: string[] = [];

    // 1. Weak Concepts and Knowledge Relationships (Prerequisites)
    const weakKOs = await AnalyticsService.getWeakConcepts(studentId);
    if (weakKOs.length > 0) {
      plan.push("--- Target Remediation (Weak Concepts) ---");
      for (const koId of weakKOs) {
        const ko = await KnowledgeService.getKO(koId);
        if (ko) {
          plan.push(`Review Concept: ${ko.title} (Performance is below 60% on quiz attempts)`);
          const related = await KnowledgeService.getRelatedKOs(koId);
          for (const rel of related) {
            plan.push(`  Prerequisite Recommendation: Review ${rel.title} to strengthen understanding of ${ko.title}`);
          }
        }
      }
    }

    // 2. Syllabus Progress
    const enrolled = await db
      .select({ courseId: enrollments.courseId })
      .from(enrollments)
      .where(eq(enrollments.userId, studentId));

    if (enrolled.length > 0) {
      plan.push("--- Curriculum Progress (Next Study Targets) ---");
      for (const enc of enrolled) {
        // Fetch chapters for this course ordered by orderIndex
        const courseChapters = await db
          .select()
          .from(chapters)
          .where(and(eq(chapters.courseId, enc.courseId), eq(chapters.status, "published")))
          .orderBy(asc(chapters.orderIndex));

        let activeChapterId: string | null = null;
        let activeChapterTitle = "";

        for (const chap of courseChapters) {
          const [progressRecord] = await db
            .select()
            .from(studentChapterProgress)
            .where(
              and(
                eq(studentChapterProgress.studentId, studentId),
                eq(studentChapterProgress.chapterId, chap.id)
              )
            );

          // The active chapter is the first chapter that is not completed
          if (!progressRecord || !progressRecord.completed) {
            activeChapterId = chap.id;
            activeChapterTitle = chap.title;
            break;
          }
        }

        if (activeChapterId) {
          // Suggest the next KOs in this chapter
          const chapterKOs = await KnowledgeService.getChapterKOs(activeChapterId);
          if (chapterKOs.length > 0) {
            plan.push(`Active Chapter: ${activeChapterTitle}`);
            // Suggest the first two active KOs in this chapter
            const targetKOs = chapterKOs.slice(0, 2);
            for (const tKo of targetKOs) {
              plan.push(`  Next Target Concept: ${tKo.title} (Type: ${tKo.type})`);
            }
          } else {
            plan.push(`Active Chapter: ${activeChapterTitle} (No active concepts loaded)`);
          }
        } else if (courseChapters.length > 0) {
          plan.push(`Course completed! You have finished all chapters of this syllabus.`);
        }
      }
    }

    if (plan.length === 0) {
      plan.push("No active enrollments or progress identified. Let's register for a course first.");
    }

    return { plan };
  }

  /**
   * Retrieve KO content first. Use AI only for analogies and simplifications.
   */
  static async explainConcept(
    koId: string,
    userId: string,
    mode: "content" | "analogy" | "simplification"
  ): Promise<{ success: boolean; data?: any; errors: string[] }> {
    const ko = await KnowledgeService.getKO(koId);
    if (!ko) {
      return { success: false, errors: ["Knowledge Object not found"] };
    }

    // Deterministic Path (Zero API Cost). The KO content is always returned
    // verbatim; the grounded pipeline (P3) only adds sources + personalization.
    if (mode === "content") {
      const data: Record<string, unknown> = {
        title: ko.title,
        content: ko.content,
        type: ko.type,
        difficulty: ko.difficulty,
      };

      try {
        const rag = await askTutorRag({
          studentId: userId,
          courseId: ko.courseId,
          chapterId: ko.chapterId,
          question: `Explain the concept: ${ko.conceptName}`,
        });
        data.sources = rag.sources;
        data.grounded = rag.grounded;
        data.matchedConcepts = rag.matchedConcepts;
        data.addendum = rag.addendum;
        data.personalized = rag.personalized;
        data.budgetExhausted = rag.budgetExhausted;
      } catch (err) {
        // Grounding is additive; never block the deterministic content on failure.
        console.warn("[Tutor RAG] grounding skipped:", (err as Error)?.message);
      }

      return { success: true, data, errors: [] };
    }

    // Exact Match Cache Check
    const cacheKey = `concept_explain:${koId}:${mode}`;
    if (explanationCache.has(cacheKey)) {
      console.log(`[Cache Hit] Serving explanation for ${cacheKey}`);
      return {
        success: true,
        data: explanationCache.get(cacheKey),
        errors: [],
      };
    }

    // Compile variables & invoke prompt executor
    const vars = await ContextAssembly.explainConcept(koId, userId);
    const result = await PromptExecutor.run({
      userId,
      prompt: tutorExplainConcept,
      variables: vars,
      schema: ExplainConceptSchema,
      useCase: USE_CASES.EXPLAIN_CONCEPT,
    });

    if (result.success && result.data) {
      explanationCache.set(cacheKey, result.data);
    }

    return result;
  }

  /**
   * Socratic analysis of student quiz mistakes.
   */
  static async analyzeMistake(
    questionId: string,
    selectedIndex: number,
    userId: string
  ): Promise<{ success: boolean; data?: any; errors: string[] }> {
    const cacheKey = `wrong_choice:${questionId}:${selectedIndex}`;
    if (explanationCache.has(cacheKey)) {
      console.log(`[Cache Hit] Serving mistake analysis for ${cacheKey}`);
      return {
        success: true,
        data: explanationCache.get(cacheKey),
        errors: [],
      };
    }

    const vars = await ContextAssembly.analyzeMistake(questionId, selectedIndex, userId);
    const result = await PromptExecutor.run({
      userId,
      prompt: tutorAnalyzeMistake,
      variables: vars,
      schema: AnalyzeMistakeSchema,
      useCase: USE_CASES.EXPLAIN_CONCEPT,
    });

    if (result.success && result.data) {
      explanationCache.set(cacheKey, result.data);
    }

    return result;
  }
}
