import { submitReviewAction } from "@/app/(student)/courses/[id]/flashcard/actions";
import { ApiResponseError } from "@/lib/query/http";
import { flashcardReviewInputSchema, flashcardReviewResultSchema, type FlashcardReviewInput } from "./review-contract";

/** Retain the existing action's exam-answer and server revalidation behavior. */
export async function submitFlashcardReview(input: FlashcardReviewInput) {
  const value = flashcardReviewInputSchema.parse(input);
  const result = await submitReviewAction(
    value.studentId,
    value.flashcardId,
    value.grade,
    value.manualAnswer,
    value.isExamMode,
    value.courseId,
  );
  const parsed = flashcardReviewResultSchema.safeParse(result);
  if (!parsed.success) throw new ApiResponseError("The server returned an invalid flashcard review", { cause: parsed.error });
  return parsed.data;
}
