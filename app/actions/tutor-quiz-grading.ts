"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { resolveActorRoles } from "@/lib/tutor/assessment-policy";
import {
  gradeQuizAttempt,
  gradeQuizAttemptSchema,
  type GradeQuizAttemptInput,
  type GradeQuizRequest,
} from "@/lib/tutor/quiz-grading";
import { db } from "@/db";
import { courses, quizTemplates, studentQuizAttempts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendToUser } from "@/lib/notifications/send";
import { quizGradedPayload } from "@/lib/notifications/templates";

export async function gradeQuizAttemptAction(input: GradeQuizAttemptInput, request?: GradeQuizRequest) {
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

  const result = await gradeQuizAttempt(session.user.id, roles, parsed.data, request && { ...request, sessionId: session.session?.id });

  if (result.gradingStatus === "graded" && !result.replayed) {
    try {
      const [row] = await db
        .select({
          studentId: studentQuizAttempts.studentId,
          templateId: studentQuizAttempts.templateId,
          quizTitle: quizTemplates.title,
          courseId: quizTemplates.courseId,
          courseTitle: courses.title,
        })
        .from(studentQuizAttempts)
        .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
        .leftJoin(courses, eq(quizTemplates.courseId, courses.id))
        .where(eq(studentQuizAttempts.id, parsed.data.attemptId))
        .limit(1);

      if (row?.studentId) {
        const scoreLabel = typeof result.score === "number" ? `${Math.round(result.score)}/100` : "-";
        await sendToUser(
          row.studentId,
          quizGradedPayload({
            quizTitle: row.quizTitle,
            courseTitle: row.courseTitle ?? parsed.data.courseId,
            scoreLabel,
            link: `/courses/${row.courseId}/quiz/${row.templateId}`,
            attemptId: parsed.data.attemptId,
          }),
        );
      }
    } catch (err) {
      console.error("[gradeQuizAttemptAction] Student graded notification failed:", err);
    }
  }

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

