import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { authorizedSnapshotDisclosures, recordAuthorizedGlobalDisclosures } from "@/lib/gamification/question-exposure";
import { quizTemplates, studentQuizAttempts, user, courses } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, desc } from "drizzle-orm";
import { normalizeDate } from "@/lib/date-utils";
import { resolveActorRoles } from "@/lib/tutor/assessment-policy";
import { resolveTutorCourseAccess } from "@/lib/auth/tutor-access";

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { isTutor, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as any)?.role,
  );

  if (!isAdmin && !isTutor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: templateId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const includeInProgress = searchParams.get("includeInProgress") === "true";

  // 1. Fetch template details
  const [template] = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      category: quizTemplates.category,
      courseId: quizTemplates.courseId,
      courseName: courses.title,
      status: quizTemplates.status,
    })
    .from(quizTemplates)
    .leftJoin(courses, eq(quizTemplates.courseId, courses.id))
    .where(eq(quizTemplates.id, templateId))
    .limit(1);

  if (!template) {
    return NextResponse.json({ error: "Quiz template not found" }, { status: 404 });
  }

  // 2. Authorize course access for non-admin actors (tutors)
  if (!isAdmin) {
    const access = await resolveTutorCourseAccess({
      penggunaId: session.user.id,
      courseId: template.courseId,
      allowAdmin: false,
    });

    if (!access.hasAccess) {
      return NextResponse.json(
        { error: `Forbidden: ${access.reason || "NO_COURSE_ACCESS"}` },
        { status: 403 },
      );
    }
  }

  // 2. Fetch all student attempts for this template
  const rawAttempts = await db
    .select({
      id: studentQuizAttempts.id,
      studentId: studentQuizAttempts.studentId,
      studentName: user.name,
      studentEmail: user.email,
      score: studentQuizAttempts.score,
      durationSeconds: studentQuizAttempts.durationSeconds,
      status: studentQuizAttempts.status,
      questionsSnapshot: studentQuizAttempts.questionsSnapshot,
      answersSnapshot: studentQuizAttempts.answersSnapshot,
      startedAt: studentQuizAttempts.startedAt,
      submittedAt: studentQuizAttempts.submittedAt,
    })
    .from(studentQuizAttempts)
    .leftJoin(user, eq(studentQuizAttempts.studentId, user.id))
    .where(eq(studentQuizAttempts.templateId, templateId))
    .orderBy(desc(studentQuizAttempts.startedAt));

  const filteredAttempts = includeInProgress
    ? rawAttempts
    : rawAttempts.filter((a) => a.status === "completed");

  const formattedAttempts = filteredAttempts.map((att) => {
    const startedDate = att.startedAt ? normalizeDate(att.startedAt) : null;
    const submittedDate = att.submittedAt ? normalizeDate(att.submittedAt) : null;
    return {
      id: att.id,
      studentId: att.studentId,
      studentName: att.studentName || "Tanpa Nama",
      studentEmail: att.studentEmail || "-",
      score: att.score ?? 0,
      durationSeconds: att.durationSeconds ?? 0,
      status: att.status,
      startedAt: startedDate ? startedDate.toISOString() : null,
      submittedAt: submittedDate ? submittedDate.toISOString() : null,
      questionsSnapshot: (att.questionsSnapshot as any[]) || [],
      answersSnapshot: (att.answersSnapshot as Record<string, any>) || {},
    };
  });

  await db.transaction(tx => recordAuthorizedGlobalDisclosures(tx, { userId: session.user.id, questions: authorizedSnapshotDisclosures(template.courseId, filteredAttempts.map(attempt => attempt.questionsSnapshot)), requestId: crypto.randomUUID() }));

  return NextResponse.json({
    template,
    attempts: formattedAttempts,
    totalCount: formattedAttempts.length,
  });
}
