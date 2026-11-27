import { and, asc, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { pkaAnnouncementReads, pkaAnnouncements, pkaSchedules, pkaSimulationStages, quizTemplates, studentQuizAttempts } from "@/db/schema";
import { isPkaEnrolled } from "@/lib/pka-enrollment";
import { PKA_ASSUMED_TEST_DATE, PKA_COURSE_ID, PKA_SUBJECTS, type PkaStage, type PkaSubject } from "@/lib/pka-config";
import { getDiagnosticSummary, getSubjectStageState, recordPkaStageResult } from "@/lib/pka-simulation";
import { canAccessStudentQuizTemplate } from "@/lib/quiz/student-access";
import { canAccessQuizSnapshot } from "@/lib/quiz/question-scope";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { PKA_PATH, type LearningData, type PkaLearningView } from "@/packages/native-parity/student/learning/contracts";

const publishedSimulation = and(
  eq(quizTemplates.courseId, PKA_COURSE_ID),
  eq(quizTemplates.status, "published"),
  eq(quizTemplates.category, "simulation"),
);

const templateFields = {
  id: quizTemplates.id,
  title: quizTemplates.title,
  timeLimitSeconds: quizTemplates.timeLimitSeconds,
};

const attemptFields = {
  id: studentQuizAttempts.id,
  templateId: studentQuizAttempts.templateId,
  status: studentQuizAttempts.status,
  score: studentQuizAttempts.score,
};

const scheduleFields = {
  id: pkaSchedules.id,
  title: pkaSchedules.title,
  sessionAt: pkaSchedules.sessionAt,
  meetLink: pkaSchedules.meetLink,
};

function serializeSchedule(schedule: { id: string; title: string; sessionAt: Date; meetLink: string | null }, now: Date) {
  const isPast = schedule.sessionAt < now;
  return { ...schedule, isPast, sessionAt: schedule.sessionAt.toISOString(), meetLink: isPast ? null : schedule.meetLink };
}

export async function readNativePkaLearning(options: {
  view: PkaLearningView;
  userId: string;
  courseTitle: string;
  stage?: { subject: PkaSubject; number: PkaStage; attemptId?: string };
}): Promise<LearningData | null> {
  const { view, userId, courseTitle } = options;
  const enrolled = await isPkaEnrolled(userId);
  if (view === "pka-registration") {
    return enrolled ? { view, state: "redirect", path: PKA_PATH } : { view, state: "ready", courseTitle };
  }
  if (!enrolled) return { view, state: "redirect", path: `${PKA_PATH}/daftar` };
  const base = { state: "ready" as const, courseTitle };
  const now = new Date();
  switch (view) {
    case "pka-material":
      return { ...base, view };
    case "pka-home": {
      const [templates, attempts, sessions, announcements] = await Promise.all([
        db.select({ id: quizTemplates.id }).from(quizTemplates).where(publishedSimulation),
        db.select({ score: studentQuizAttempts.score }).from(studentQuizAttempts)
          .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
          .where(and(eq(studentQuizAttempts.studentId, userId), eq(studentQuizAttempts.status, "completed"),
            eq(quizTemplates.courseId, PKA_COURSE_ID), eq(quizTemplates.category, "simulation"))),
        db.select(scheduleFields).from(pkaSchedules).where(gt(pkaSchedules.sessionAt, now)).orderBy(asc(pkaSchedules.sessionAt)).limit(1),
        db.select({ id: pkaAnnouncements.id, title: pkaAnnouncements.title, body: pkaAnnouncements.body,
          createdAt: pkaAnnouncements.createdAt, isPinned: pkaAnnouncements.isPinned }).from(pkaAnnouncements)
          .leftJoin(pkaAnnouncementReads, and(eq(pkaAnnouncements.id, pkaAnnouncementReads.announcementId), eq(pkaAnnouncementReads.userId, userId)))
          .where(and(eq(pkaAnnouncements.isArchived, false), or(eq(pkaAnnouncements.isPinned, true), isNull(pkaAnnouncementReads.userId))))
          .orderBy(desc(pkaAnnouncements.isPinned), desc(pkaAnnouncements.createdAt)),
      ]);
      return { ...base, view, testDate: PKA_ASSUMED_TEST_DATE.toISOString(),
        nextSession: sessions[0] ? serializeSchedule(sessions[0], now) : null,
        announcements: announcements.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
        simulationCount: templates.length, completedCount: attempts.length,
        bestScore: attempts.reduce((best, attempt) => Math.max(best, attempt.score ?? 0), 0) };
    }
    case "pka-schedule": {
      const schedules = await db.select(scheduleFields).from(pkaSchedules).orderBy(asc(pkaSchedules.sessionAt));
      return { ...base, view, schedules: schedules.map((schedule) => serializeSchedule(schedule, now)) };
    }
    case "pka-report":
      return { ...base, view, results: await getDiagnosticSummary(userId, PKA_SUBJECTS) };
    case "pka-simulation": {
      const [access, templates, attempts, stageRows] = await Promise.all([
        resolveCourseAccess({ courseId: PKA_COURSE_ID, userId }),
        db.select(templateFields).from(quizTemplates).where(publishedSimulation).orderBy(desc(quizTemplates.createdAt)),
        db.select(attemptFields).from(studentQuizAttempts).innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
          .where(and(eq(studentQuizAttempts.studentId, userId), publishedSimulation)).orderBy(desc(studentQuizAttempts.startedAt)),
        db.select({ templateId: pkaSimulationStages.quizTemplateId, subject: pkaSimulationStages.subject, number: pkaSimulationStages.stage })
          .from(pkaSimulationStages).orderBy(asc(pkaSimulationStages.subject), asc(pkaSimulationStages.stage)),
      ]);
      const stageByTemplate = new Map(stageRows.map(({ templateId, subject, number }) => [templateId, { subject, number: number as PkaStage }]));
      return { ...base, view, hasFullContentAccess: access.hasFullContentAccess,
        templates: templates.map((template) => ({ ...template, stage: stageByTemplate.get(template.id) })), attempts };
    }
    case "pka-stage": {
      if (!options.stage) return null;
      const { subject, number, attemptId } = options.stage;
      const stages = await getSubjectStageState(userId, subject);
      const stage = stages.find((item) => item.stage === number);
      if (!stage) return null;
      const [template] = await db.select().from(quizTemplates)
        .where(and(publishedSimulation, eq(quizTemplates.id, stage.quizTemplateId))).limit(1);
      if (!template) return null;
      const access = await resolveCourseAccess({ courseId: template.courseId, userId });
      if (!canAccessStudentQuizTemplate(access, template)) return { view, state: "locked", courseTitle };
      const publicTemplate = { id: template.id, title: template.title, timeLimitSeconds: template.timeLimitSeconds };
      let attempt = null;
      if (stage.status !== "locked" && attemptId) {
        const [row] = await db.select({ ...attemptFields, questions: studentQuizAttempts.questionsSnapshot })
          .from(studentQuizAttempts).where(and(eq(studentQuizAttempts.id, attemptId),
            eq(studentQuizAttempts.studentId, userId), eq(studentQuizAttempts.templateId, template.id))).limit(1);
        if (!row || !await canAccessQuizSnapshot(access, row.questions)) return null;
        if (row.status === "completed") await recordPkaStageResult(row.id);
        attempt = { id: row.id, status: row.status, templateId: row.templateId, score: row.score };
      } else if (stage.status !== "locked") {
        [attempt = null] = await db.select(attemptFields).from(studentQuizAttempts)
          .where(and(eq(studentQuizAttempts.studentId, userId), eq(studentQuizAttempts.templateId, template.id),
            eq(studentQuizAttempts.status, "in_progress"))).orderBy(desc(studentQuizAttempts.startedAt)).limit(1);
      }
      return { ...base, view, stage, template: publicTemplate, attempt };
    }
  }
}

export async function acknowledgeNativePkaAnnouncement(userId: string, announcementId: string) {
  if (!await isPkaEnrolled(userId)) return "forbidden";
  const [announcement] = await db.select({ id: pkaAnnouncements.id }).from(pkaAnnouncements)
    .where(and(eq(pkaAnnouncements.id, announcementId), eq(pkaAnnouncements.isArchived, false), eq(pkaAnnouncements.isPinned, false))).limit(1);
  if (!announcement) return "missing";
  await db.insert(pkaAnnouncementReads).values({ announcementId, userId }).onConflictDoNothing();
  return "ok";
}
