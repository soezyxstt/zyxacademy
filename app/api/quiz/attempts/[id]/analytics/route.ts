import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { studentQuizAnalytics, studentQuizAttempts, quizTemplates } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: attemptId } = await params;

  // Verify attempt ownership or admin/teacher role
  const [attempt] = await db
    .select({
      id: studentQuizAttempts.id,
      studentId: studentQuizAttempts.studentId,
      templateId: studentQuizAttempts.templateId,
      status: studentQuizAttempts.status,
    })
    .from(studentQuizAttempts)
    .where(eq(studentQuizAttempts.id, attemptId))
    .limit(1);

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  const isOwner = attempt.studentId === session.user.id;
  const isAdminOrTeacher =
    (await hasAnyPeran(session.user.id, ["admin", "tutor"], { allowAdmin: true })) ||
    session.user.role === "admin" ||
    session.user.role === "teacher";

  if (!isOwner && !isAdminOrTeacher) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // If attempt is not completed, block analytics access to prevent key answer leaks during active attempts
  if (attempt.status !== "completed") {
    return NextResponse.json({ status: "not_available", message: "Analytics are only accessible after quiz completion" });
  }

  // Look up existing analytics
  const [analytics] = await db
    .select()
    .from(studentQuizAnalytics)
    .where(eq(studentQuizAnalytics.attemptId, attemptId))
    .limit(1);

  if (analytics) {
    return NextResponse.json(analytics);
  }

  const [template] = await db
    .select({ courseId: quizTemplates.courseId })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, attempt.templateId))
    .limit(1);

  const courseId = template?.courseId || "calc-1";

  try {
    const recordId = `sqa_${attemptId}`;

    await db.insert(studentQuizAnalytics).values({
      id: recordId,
      attemptId,
      studentId: attempt.studentId,
      templateId: attempt.templateId,
      courseId,
      status: "processing",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();

    await inngest.send({
      name: "quiz/analytics.requested",
      data: { attemptId, studentId: attempt.studentId, courseId },
    }).catch((err) => console.error("Inngest send error:", err));

    return NextResponse.json({
      id: recordId,
      attemptId,
      studentId: attempt.studentId,
      templateId: attempt.templateId,
      courseId,
      status: "processing",
      computedMetrics: null,
      aiDiagnosis: null,
    }, { status: 202 });
  } catch (err: any) {
    console.error("Failed to enqueue quiz analytics:", err);
    return NextResponse.json({ error: "Failed to generate analytics" }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: attemptId } = await params;

  const [attempt] = await db
    .select({
      id: studentQuizAttempts.id,
      studentId: studentQuizAttempts.studentId,
      templateId: studentQuizAttempts.templateId,
      status: studentQuizAttempts.status,
    })
    .from(studentQuizAttempts)
    .where(eq(studentQuizAttempts.id, attemptId))
    .limit(1);

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  const isOwner = attempt.studentId === session.user.id;
  const isAdminOrTeacher =
    (await hasAnyPeran(session.user.id, ["admin", "tutor"], { allowAdmin: true })) ||
    session.user.role === "admin" ||
    session.user.role === "teacher";

  if (!isOwner && !isAdminOrTeacher) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (attempt.status !== "completed") {
    return NextResponse.json({ error: "Cannot generate analytics for an active attempt" }, { status: 400 });
  }

  const [template] = await db
    .select({ courseId: quizTemplates.courseId })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, attempt.templateId))
    .limit(1);

  const courseId = template?.courseId || "calc-1";

  // Mark or insert record in DB as processing immediately
  const [existing] = await db
    .select({ id: studentQuizAnalytics.id })
    .from(studentQuizAnalytics)
    .where(eq(studentQuizAnalytics.attemptId, attemptId))
    .limit(1);

  if (existing) {
    await db
      .update(studentQuizAnalytics)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(studentQuizAnalytics.id, existing.id));
  } else {
    await db.insert(studentQuizAnalytics).values({
      id: `sqa_${attemptId}`,
      attemptId,
      studentId: attempt.studentId,
      templateId: attempt.templateId,
      courseId,
      status: "processing",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }

  await inngest.send({
    name: "quiz/analytics.requested",
    data: { attemptId, studentId: attempt.studentId, courseId },
  });

  return NextResponse.json(
    { message: "Analytics generation re-queued", attemptId, status: "processing" },
    { status: 202 }
  );
}
