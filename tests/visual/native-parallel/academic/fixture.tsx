import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import "katex/dist/katex.min.css";
import { ApplicationPage } from "@/components/application-page";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ChaptersTab } from "@/components/admin/course-detail/chapters-tab";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { CoursesDashboard } from "@/components/admin/courses-dashboard";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar, MobileTopNavSearchTrigger } from "@/components/navigation/mobile-top-navbar";
import { PageHeader } from "@/components/page-header";
import { AnalyticsClient } from "@/components/tutor/analytics-client";
import { TutorScheduleView } from "@/components/tutor/tutor-schedule-view";
import { Toaster } from "@/components/ui/toast";
import { TutorDashboardContent } from "@/features/tutor-dashboard/ui/tutor-dashboard-content";
import { GradingClient } from "@/app/(tutor)/tutor/[courseId]/grading/grading-client";
import { ParticipantsClient } from "@/app/(tutor)/tutor/[courseId]/participants/participants-client";
import { QuizzesClient } from "@/app/(tutor)/tutor/[courseId]/quizzes/quizzes-client";
import { TutorQuizGradingClient } from "@/app/(tutor)/tutor/[courseId]/quizzes/grading/grading-client";
import { TryoutsClient } from "@/app/(tutor)/tutor/[courseId]/tryouts/tryouts-client";
import { makeAssessmentFixture } from "@/packages/native-parity/academic/assessment/fixtures";
import { courseFixtures } from "@/packages/native-parity/academic/courses/fixtures";
import { createTutorFixtureData, tutorFixtureCourses } from "@/packages/native-parity/academic/tutor/fixtures";
import type { SnapshotPayload } from "@/lib/cohort-analytics";
import type { TutorScheduleReadModel } from "@/lib/schedule/tutor-read-model";
import admin from "@/messages/id/admin.json";
import adminAcademic from "@/messages/id/adminAcademic.json";
import adminOps from "@/messages/id/adminOps.json";
import core from "@/messages/id/core.json";
import scheduleMessages from "@/messages/id/schedule.json";
import searchMessages from "@/messages/id/search.json";
import studentCourse from "@/messages/id/studentCourse.json";
import tutor from "@/messages/id/tutor.json";
import ui from "@/messages/id/ui.json";
import { groupsView, tokensView, usersView } from "./administration";

const { pathname, search } = window.location;
const [, area, courseOrSection, idOrSection, subSection] = pathname.split("/");
const state = new URLSearchParams(search).get("state");
const actor = { id: "academic-tutor", role: "tutor" };
const empty = state === "empty";
const dataSource = createTutorFixtureData(actor, empty ? "empty" : "populated");
const signal = new AbortController().signal;
const course = courseFixtures.find(({ course }) => [course.id, course.slug].includes(area === "admin" ? idOrSection : courseOrSection)) ?? courseFixtures[0];
const { id: courseId, title: courseTitle } = course.course;
const tutorCoursePath = `/tutor/${courseId}`;
const routeTitle = tutor.routeTitles;
const toDate = (value: string | null) => value === null ? null : new Date(value);

function withHeader(title: string, href: string, content: ReactNode) {
  return <><PageHeader title={title} backHref={href} backLabel={routeTitle.overview} />{content}</>;
}

function courseAnalytics(): SnapshotPayload {
  const concepts = empty ? [] : [
    { conceptName: "Perpindahan zat melalui membran sel", avgMastery: 34, studentCount: 3, bucketLow: 2, bucketMid: 1, bucketHigh: 0 },
    { conceptName: "Fungsi organel pada respirasi seluler", avgMastery: 59, studentCount: 2, bucketLow: 1, bucketMid: 0, bucketHigh: 1 },
  ];
  return {
    courseTitle, enrolledCount: empty ? 0 : 3, activeCount: empty ? 0 : 2,
    weakConcepts: concepts, allConcepts: concepts, interventionCounts: [],
    conceptTrends: {}, mostMissed: {}, topMisconceptions: [], watchlist: [],
    engagement: { quizParticipationPct: empty ? 0 : 67, flashcardAdherencePct: 0 },
  };
}

async function tutorDashboard() {
  const dashboard = await dataSource.dashboard(signal);
  return <TutorDashboardContent locale="id" {...dashboard} />;
}

async function tutorParticipants() {
  const payload = await dataSource.participants(courseId, signal);
  const participants = payload.participants.map((participant) => ({
    ...participant,
    image: null,
    enrolledAt: toDate(participant.enrolledAt),
    expiresAt: toDate(participant.expiresAt),
    groups: participant.groups.map((group) => ({ ...group, packageType: "regular", joinedAt: null })),
  }));
  return (
    <ParticipantsClient data={{
      course: {
        id: courseId, title: courseTitle, code: payload.course.code ?? "",
        legacyCourseId: payload.course.legacyCourseId, accessSource: null, isCompatibilityFallback: false,
      },
      summary: {
        totalParticipants: participants.length,
        directEnrollmentsCount: participants.filter(({ enrollmentType }) => enrollmentType !== "group").length,
        groupParticipantsCount: participants.filter(({ enrollmentType }) => enrollmentType !== "direct").length,
        activeGroupsCount: payload.groups.length,
      },
      participants,
      groups: payload.groups.map((group) => ({
        ...group, packageType: "regular", status: "active", weeklyQuotaSessions: 1,
        academicYear: "2026/2027", semester: "1", representative: null,
        members: group.members.map((member) => ({ ...member, image: null, joinedAt: null })),
      })),
    }} />
  );
}

async function tryoutGrading() {
  const payload = await dataSource.grading(courseId, signal);
  return (
    <GradingClient
      tutorId={actor.id}
      courseId={courseId}
      initialSubmissions={payload.submissions.map((submission) => ({ ...submission, submittedAt: toDate(submission.submittedAt) }))}
      queueHeader={<PageHeader title={routeTitle.tryoutGrading} backHref={tutorCoursePath} backLabel={routeTitle.overview} />}
    />
  );
}

async function tutorSchedule() {
  const dashboard = await dataSource.dashboard(signal);
  const schedule: TutorScheduleReadModel = {
    tutor: { id: actor.id, name: "Tutor Akademik", email: "tutor@example.test", status: "active" },
    compatibilitySource: "canonical",
    assignedActiveCourses: empty ? [] : tutorFixtureCourses.map((assigned) => ({
      courseId: assigned.courseId,
      title: assigned.title,
      code: assigned.code ?? "",
      legacyCourseId: assigned.legacyCourseId,
      source: "canonical_assignment",
      isCompatibilityFallback: false,
    })),
    eligibleGroups: [],
    ownedSlots: dashboard.upcomingSessions.map((session) => ({
      id: session.id,
      tutorId: actor.id,
      dayOfWeek: "Sabtu",
      sessionDate: session.sessionDate,
      startTime: session.startTime ?? "",
      endTime: session.endTime ?? "",
      mode: "online",
      location: null,
      createdAt: new Date("2026-11-21T12:00:00Z"),
      booking: null,
    })),
    ownedBookings: [],
    ownedTickets: [],
    ownedSchedules: [],
  };
  return <TutorScheduleView initialData={schedule} currentUserId={actor.id} />;
}

const assessment = makeAssessmentFixture();
const templates: ComponentProps<typeof QuizzesClient>["initialTemplates"] = assessment.quizzes
  .map((quiz) => ({
    ...quiz,
    selectionRules: quiz.selection.mode === "specific"
      ? { count: quiz.selection.questionIds.length, fixedQuestionIds: quiz.selection.questionIds }
      : { count: quiz.selection.count, tags: quiz.selection.tags, difficulty_proportions: quiz.selection.difficulty },
  }));
const bank: ComponentProps<typeof QuizzesClient>["initialQuestionBank"] = assessment.bank.map((question) => ({
  ...question,
  courseId,
  questionType: question.type,
}));

function quizzes() {
  return <QuizzesClient courseId={courseId} initialQuestionBank={empty ? [] : bank} initialTemplates={empty ? [] : templates} />;
}

function quizGrading() {
  const attempts = empty ? [] : assessment.attempts.filter(({ status }) => status === "pending");
  return <TutorQuizGradingClient
    courseId={courseId}
    tutorId={actor.id}
    queueHeader={<PageHeader title={routeTitle.quizGrading} backHref={`${tutorCoursePath}/quizzes`} />}
    pendingAttempts={attempts.map((attempt) => ({
      ...attempt,
      studentId: "academic-student-1",
      submittedAt: new Date(attempt.submittedAt ?? ""),
      totalQuestions: attempt.answers.length,
      essayCount: attempt.answers.filter(({ type }) => type === "essay").length,
      remainingEssayCount: attempt.remainingEssays,
    }))}
  />;
}

function tryouts() {
  const tryouts = empty ? [] : assessment.tryouts;
  return <TryoutsClient
    courseId={courseId}
    initialTryouts={tryouts.map((exam) => ({ ...exam, courseId, type: "tryout", settings: { timeLimitMinutes: exam.timeLimitMinutes, maxAttempts: exam.maxAttempts } }))}
    initialQuestions={tryouts.flatMap((exam) => exam.questions.map((question) => ({
      ...question, examId: exam.id, content: { ...question, correctIndex: question.correctIndices[0] },
    })))}
    questionBank={empty ? [] : assessment.bank.map((question) => ({
      id: question.id, prompt: question.prompt, questionType: question.type,
      difficulty: question.difficulty, origin: question.origin, sourceEventName: question.sourceEventName ?? null,
    }))}
  />;
}

function adminCourses() {
  return (
    <div className="min-w-0 space-y-(--related-gap)">
      <AdminPageHeader title={adminAcademic.courses.pageTitle} />
      <CoursesDashboard initialCourses={empty ? [] : courseFixtures.map(({ course }) => course)} />
    </div>
  );
}

function adminCourse() {
  return (
    <div className="min-w-0 space-y-(--compact-gap)">
      <CourseDetailHeader course={course.course} />
      <ChaptersTab
        courseId={courseId}
        courseTitle={courseTitle}
        initialChapters={course.chapters.map((chapter) => ({ ...chapter, courseId }))}
        materials={course.documents.map(({ id, chapterId }) => ({ id, chapterIds: chapterId ? [chapterId] : [] }))}
        questions={[...course.questions]}
      />
    </div>
  );
}

async function resolveFixture() {
  if (area === "admin") {
    if (courseOrSection === "groups") return [adminOps.groups.title, groupsView(empty)] as const;
    if (courseOrSection === "tokens") return [adminOps.tokens.title, tokensView(empty)] as const;
    if (courseOrSection === "users") return [adminOps.users.title, usersView(empty)] as const;
    return idOrSection ? [courseTitle, adminCourse()] as const : [adminAcademic.courses.pageTitle, adminCourses()] as const;
  }
  if (!courseOrSection) return [tutor.dashboard.title, await tutorDashboard()] as const;
  if (courseOrSection === "schedule") return [routeTitle.scheduleTitle, await tutorSchedule()] as const;
  switch (idOrSection) {
    case "participants":
      return [routeTitle.participants, withHeader(`${routeTitle.participants}: ${courseTitle}`, tutorCoursePath, await tutorParticipants())] as const;
    case "grading":
      return [routeTitle.tryoutGrading, await tryoutGrading()] as const;
    case "quizzes":
      return subSection === "grading"
        ? [routeTitle.quizGrading, quizGrading()] as const
        : [routeTitle.manageQuizzes, withHeader(routeTitle.manageQuizzesAndBank, tutorCoursePath, quizzes())] as const;
    case "tryouts":
      // The former TryoutsClient is now mounted by /visual-fixtures/tutor-tryouts. The protected route redirects.
      return ["Tryout", tryouts()] as const;
    default:
      return [courseTitle, withHeader(courseTitle, "/tutor", <AnalyticsClient courseId={courseId} analytics={courseAnalytics()} updatedAt={empty ? null : "2026-11-25T06:00:00Z"} />)] as const;
  }
}

void resolveFixture().then(([title, body]) => {
  createRoot(document.getElementById("root")!).render(
    <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={{ admin, adminAcademic, adminOps, core, schedule: scheduleMessages, search: searchMessages, studentCourse, tutor, ui }}>
      <MobileChromeProvider hasTopNav>
        <MobileTopNavbar title={title} rightActions={<MobileTopNavSearchTrigger label={searchMessages.searchAction} />} />
        <main id="main-content" className="min-w-0">
          <ApplicationPage>{body}</ApplicationPage>
        </main>
        <Toaster theme={document.documentElement.classList.contains("dark") ? "dark" : "light"} />
      </MobileChromeProvider>
    </NextIntlClientProvider>,
  );
});
