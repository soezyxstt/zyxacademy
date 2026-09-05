"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { resolveActorRoles } from "@/lib/tutor/assessment-policy";
import {
  gradeQuizAttempt,
  gradeQuizAttemptSchema,
  type GradeQuizAttemptInput,
} from "@/lib/tutor/quiz-grading";

export async function gradeQuizAttemptAction(input: GradeQuizAttemptInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { roles } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  const parsed = gradeQuizAttemptSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Validasi gagal: ${parsed.error.issues.map((i) => i.message).join(", ")}`);
  }

  const result = await gradeQuizAttempt(session.user.id, roles, parsed.data);

  revalidatePath(`/tutor/${parsed.data.courseId}/quizzes/grading`);
  revalidatePath(`/tutor/${parsed.data.courseId}/quizzes`);
  return result;
}

export async function getQuizAttemptDetailsAction(courseId: string, attemptId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { getQuizAttemptDetailsForGrading } = await import("@/lib/tutor/quiz-grading");
  return getQuizAttemptDetailsForGrading(courseId, attemptId, session.user.id);
}

