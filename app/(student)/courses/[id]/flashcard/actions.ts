"use server";

import { submitReview as dbSubmitReview } from "@/lib/flashcard-actions";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function submitReviewAction(
  _studentId: string,
  flashcardId: string,
  grade: number,
  manualAnswer?: string,
  isExamMode: boolean = false,
  courseId?: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("Unauthorized");
  const result = await dbSubmitReview(session.user.id, flashcardId, grade, manualAnswer, isExamMode);
  if (courseId) {
    revalidatePath(`/courses/${courseId}/flashcard`);
  }
  return result;
}
