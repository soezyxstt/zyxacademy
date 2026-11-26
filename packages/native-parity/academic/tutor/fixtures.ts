import { createTutorFixtureRepository } from "./fixture-interactions";
import { matchesCourse, TutorDataError, type TutorCourse, type TutorDashboard, type TutorDataSource, type TutorGroup, type TutorParticipant, type TutorSubmission } from "./model";

export const tutorFixtureCourses: TutorCourse[] = [
  { courseId: "academic-course-1", legacyCourseId: "biologi-dasar", code: "BIO101", title: "Biologi Dasar", groupCount: 1 },
  { courseId: "academic-course-2", legacyCourseId: "fisika-dasar", code: "FIS101", title: "Fisika Dasar", groupCount: 0 },
];

const groups: TutorGroup[] = [{
  id: "academic-group-1",
  name: "Kelompok Sel",
  packageName: "Tutorial reguler",
  usedQuotaSessions: 2,
  totalQuotaSessions: 8,
  membersCount: 2,
  members: [
    { userId: "academic-student-1", name: "Nadia Lestari", email: "nadia@example.test", role: "leader" },
    { userId: "academic-student-2", name: "Rafi Ananda", email: "rafi@example.test", role: "member" },
  ],
}];

const participants: TutorParticipant[] = [
  { ...groups[0].members[0], enrollmentType: "both", enrolledAt: "2026-11-04", expiresAt: null, groups: [{ id: groups[0].id, name: groups[0].name, role: "leader" }] },
  { ...groups[0].members[1], enrollmentType: "group", enrolledAt: "2026-11-10", expiresAt: null, groups: [{ id: groups[0].id, name: groups[0].name, role: "member" }] },
  { userId: "academic-student-3", name: "Meilani Prameswari", email: "meilani@example.test", enrollmentType: "direct", enrolledAt: "2026-11-12", expiresAt: "2027-01-31", groups: [] },
];

const pendingSubmission: TutorSubmission = {
  id: "academic-submission-1",
  studentName: "Nadia Lestari",
  studentEmail: "nadia@example.test",
  examTitle: "Tryout struktur dan fungsi sel",
  status: "pending_review",
  score: null,
  teacherNotes: null,
  submittedAt: "2026-11-25T07:30:00.000Z",
  questionsSnapshot: [
    { id: "academic-question-1", type: "essay", prompt: "Jelaskan bagaimana struktur membran sel mendukung perpindahan zat." },
    { id: "academic-question-2", type: "multiple_choice", prompt: "Organel manakah yang berperan dalam respirasi sel?", options: ["Ribosom", "Mitokondria", "Badan Golgi"], correctIndex: 1 },
  ],
  answersSnapshot: {
    "academic-question-1": { text: "Lapisan ganda fosfolipid memungkinkan molekul tertentu lewat. Protein saluran membantu perpindahan ion." },
    "academic-question-2": { index: 1 },
  },
};

const gradedSubmission: TutorSubmission = {
  ...pendingSubmission,
  id: "academic-submission-2",
  studentName: "Rafi Ananda",
  studentEmail: "rafi@example.test",
  status: "graded",
  score: 85,
  teacherNotes: "Tambahkan contoh transpor aktif.",
  submittedAt: "2026-11-24T08:10:00.000Z",
  answersSnapshot: {
    "academic-question-1": { text: "Membran bersifat selektif. Molekul kecil dapat melewati fosfolipid." },
    "academic-question-2": { index: 1 },
  },
};

const upcomingSessions: TutorDashboard["upcomingSessions"] = [{
  id: "academic-session-1",
  courseTitle: "Biologi Dasar",
  topic: "Struktur dan fungsi sel",
  sessionDate: "2026-11-28",
  startTime: "09:00",
  endTime: "10:30",
  groupName: "Kelompok Sel",
  mode: "online",
}];

export function createTutorFixtureData(
  actor: { id: string; role: string },
  scenario: "populated" | "empty" | "error",
): Extract<TutorDataSource, { fixture: true }> {
  let failNext = scenario === "error";
  let submissions = [pendingSubmission, gradedSubmission];
  const empty = scenario === "empty";

  function authorize() {
    if (actor.role !== "tutor" || actor.id !== "academic-tutor") throw new TutorDataError(403);
  }

  function getCourse(courseId: string) {
    authorize();
    const course = tutorFixtureCourses.find((entry) => matchesCourse(entry, courseId));
    if (!course) throw new TutorDataError(403);
    return empty ? { ...course, groupCount: 0 } : course;
  }

  function checkRead(signal: AbortSignal) {
    if (signal.aborted) throw new TutorDataError(499);
    if (failNext) {
      failNext = false;
      throw new TutorDataError(503);
    }
  }

  return {
    fixture: true,
    repository: createTutorFixtureRepository(!empty, authorize, (courseId) => {
      const course = courseId ? getCourse(courseId) : tutorFixtureCourses[0];
      return !empty && course.courseId === tutorFixtureCourses[0].courseId;
    }),
    async dashboard(signal) {
      authorize();
      checkRead(signal);
      return {
        courses: empty ? [] : tutorFixtureCourses,
        counts: { courses: empty ? 0 : 2, activeGroups: empty ? 0 : 1, sessionsThisWeek: empty ? 0 : 1, pendingTickets: empty ? 0 : 1 },
        upcomingSessions: empty ? [] : upcomingSessions,
        pendingTickets: empty ? [] : [{ id: "academic-ticket-1", type: "reschedule", reason: "Kelompok meminta waktu pengganti." }],
      };
    },
    async participants(courseId, signal) {
      const course = getCourse(courseId);
      checkRead(signal);
      const populated = !empty && course.courseId === tutorFixtureCourses[0].courseId;
      return { course, participants: populated ? participants : [], groups: populated ? groups : [] };
    },
    async grading(courseId, signal) {
      const course = getCourse(courseId);
      checkRead(signal);
      return { course, submissions: !empty && course.courseId === tutorFixtureCourses[0].courseId ? submissions : [] };
    },
    async analytics(courseId, signal) {
      const course = getCourse(courseId);
      checkRead(signal);
      const populated = !empty && course.courseId === tutorFixtureCourses[0].courseId;
      const concepts = populated ? [{ conceptName: "Perpindahan zat melalui membran", avgMastery: 62, studentCount: 3, bucketLow: 1, bucketMid: 1, bucketHigh: 1 }] : [];
      return {
        courseTitle: course.title,
        enrolledCount: populated ? 3 : 0,
        activeCount: populated ? 2 : 0,
        weakConcepts: concepts,
        allConcepts: concepts,
        interventionCounts: populated ? [{ conceptName: "Perpindahan zat melalui membran", count: 1 }] : [],
        updatedAt: populated ? "2026-06-19T04:00:00.000Z" : null,
        quizParticipationPct: populated ? 67 : 0,
        watchlist: populated ? [{ studentId: participants[0].userId, name: participants[0].name,
          decliningConcepts: ["Perpindahan zat melalui membran"], activeInterventionCount: 1, lastActiveAt: "2026-06-18T10:00:00.000Z" }] : [],
        topMisconceptions: populated ? [{ misconceptionKoId: "fixture-osmosis", label: "Arah perpindahan pelarut",
          conceptName: "Perpindahan zat melalui membran", pctSelected: 40, sampleSize: 10 }] : [],
        conceptTrends: populated ? { "Perpindahan zat melalui membran": [{ week: "W1", avgMastery: 68 }, { week: "W2", avgMastery: 62 }] } : {},
        mostMissed: populated ? { "Perpindahan zat melalui membran": [{ id: "fixture-missed", prompt: "Bagaimana air berpindah melalui membran?",
          correctRate: 0.4, attemptCount: 10 }] } : {},
      };
    },
    async saveGrade(courseId, submissionId, grade) {
      const course = getCourse(courseId);
      if (empty || course.courseId !== tutorFixtureCourses[0].courseId ||
          !submissions.some((submission) => submission.id === submissionId)) {
        throw new TutorDataError(404);
      }
      if (!Number.isInteger(grade.score) || grade.score < 0 || grade.score > 100) throw new TutorDataError(400);
      submissions = submissions.map((submission) =>
        submission.id === submissionId
          ? { ...submission, score: grade.score, teacherNotes: grade.notes, status: "graded" }
          : submission,
      );
    },
  };
}

export const tutorParityCases = [
  { id: "tutor-dashboard-assigned-light", component: "TutorDashboard", theme: "light", path: "/tutor", scenario: "populated", actor: "academic-tutor" },
  { id: "tutor-participants-empty-dark", component: "TutorParticipants", theme: "dark", path: "/tutor/academic-course-2/participants", scenario: "populated", actor: "academic-tutor" },
  { id: "tutor-grading-pending-light", component: "TutorGrading", theme: "light", path: "/tutor/academic-course-1/grading", scenario: "populated", actor: "academic-tutor" },
  { id: "tutor-participants-forbidden-light", component: "TutorParticipants", theme: "light", path: "/tutor/academic-course-3/participants", scenario: "populated", actor: "academic-tutor" },
  { id: "tutor-grading-retry-dark", component: "TutorGrading", theme: "dark", path: "/tutor/academic-course-1/grading", scenario: "error", actor: "academic-tutor" },
] as const;
