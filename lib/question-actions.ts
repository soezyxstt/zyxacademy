import { db } from "@/db";
import { aiQuestionBank } from "@/db/schema";
import { validateQuestion } from "@/lib/question-validator";
import { eq } from "drizzle-orm";
import { validateQuestionVisualAssets } from "@/lib/authoring/question-visual-assets";

/**
 * Saves manual modifications to a question from a tutor.
 * Automatically marks the question as 'reviewed' and locks it from AI overwrite.
 */
export async function saveTutorQuestionEdit(
  questionId: string,
  prompt: string,
  options: string[],
  correctIndices: number[],
  explanation: string,
  tutorUserId: string // logged for audit trails
): Promise<{ success: boolean; errors?: string[] }> {
  try { await validateQuestionVisualAssets([{ prompt, options, explanation }]); }
  catch (error) { return { success: false, errors: [error instanceof Error ? error.message : "QUESTION_VISUAL_FORMAT_INVALID"] }; }
  // Fetch existing question to retrieve KO association and other values
  const [currentQ] = await db
    .select()
    .from(aiQuestionBank)
    .where(eq(aiQuestionBank.id, questionId));

  if (!currentQ) {
    return { success: false, errors: [`Question not found: ${questionId}`] };
  }

  if (currentQ.origin !== "zyx_original") {
    return { success: false, errors: ["Historical and legacy reference questions are immutable."] };
  }

  // Enforce QC checks before saving
  const validationInput = {
    knowledgeObjectId: currentQ.knowledgeObjectId || "",
    prompt,
    options,
    correctIndices,
    explanation,
  };

  const qc = await validateQuestion(validationInput);
  if (!qc.success) {
    return { success: false, errors: qc.errors };
  }

  // Update in DB inside a transaction
  await db.transaction(async tx => {
    await tx
      .update(aiQuestionBank)
      .set({
        prompt,
        options,
        correctIndices,
        explanation,
        reviewStatus: "reviewed", // Sets the tutor overwrite lock
        qualityScore: 1.0, // Resets to perfect verification score
      })
      .where(eq(aiQuestionBank.id, questionId));
  });

  console.log(`[Tutor Action] Question ${questionId} edited by Tutor ${tutorUserId} and locked.`);
  return { success: true };
}

/**
 * Approves a question, promoting its status to 'published' so that it is included in student templates.
 */
export async function approveAndPublishQuestion(
  questionId: string
): Promise<{ success: boolean; errors?: string[] }> {
  const [question] = await db
    .select()
    .from(aiQuestionBank)
    .where(eq(aiQuestionBank.id, questionId));

  if (!question) {
    return { success: false, errors: [`Question not found: ${questionId}`] };
  }

  if (question.origin !== "zyx_original") {
    return { success: false, errors: ["Historical and legacy reference questions are immutable."] };
  }

  try { await validateQuestionVisualAssets([{ prompt: question.prompt, options: Array.isArray(question.options) ? question.options.map(String) : [], explanation: question.explanation }]); }
  catch (error) { return { success: false, errors: [error instanceof Error ? error.message : "QUESTION_VISUAL_FORMAT_INVALID"] }; }

  // Run validation on existing values to ensure KaTeX and structure are compliant
  const qc = await validateQuestion({
    knowledgeObjectId: question.knowledgeObjectId || "",
    prompt: question.prompt,
    options: question.options as string[],
    correctIndices: question.correctIndices as number[],
    explanation: question.explanation,
  });

  if (!qc.success) {
    return {
      success: false,
      errors: [`Cannot publish due to validation failures:`, ...qc.errors],
    };
  }

  await db
    .update(aiQuestionBank)
    .set({
      reviewStatus: "published",
    })
    .where(eq(aiQuestionBank.id, questionId));

  console.log(`[Tutor Action] Question ${questionId} published and made active.`);
  return { success: true };
}

/**
 * Soft-retires a question, excluding it from active selection pools but retaining it in the database.
 * Prevents breaks in historical attempt snapshots.
 */
export async function retireQuestion(
  questionId: string
): Promise<{ success: boolean; errors?: string[] }> {
  const [question] = await db
    .select()
    .from(aiQuestionBank)
    .where(eq(aiQuestionBank.id, questionId));

  if (!question) {
    return { success: false, errors: [`Question not found: ${questionId}`] };
  }

  if (question.origin !== "zyx_original") {
    return { success: false, errors: ["Historical and legacy reference questions are immutable."] };
  }

  await db
    .update(aiQuestionBank)
    .set({
      reviewStatus: "retired",
    })
    .where(eq(aiQuestionBank.id, questionId));

  console.log(`[Tutor Action] Question ${questionId} retired.`);
  return { success: true };
}
