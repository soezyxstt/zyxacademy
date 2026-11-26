import type { TutorSupportClient } from "../../../academic/tutor-support";
import type { TutorFixtureRepository } from "./fixture-interactions";

export type TutorCourse = {
  courseId: string;
  legacyCourseId: string | null;
  code: string | null;
  title: string;
  groupCount: number;
};

export type TutorSession = {
  id: string;
  courseTitle: string | null;
  topic: string | null;
  sessionDate: string | null;
  startTime: string | null;
  endTime: string | null;
  groupName: string | null;
  mode: string | null;
};

export type TutorDashboard = {
  courses: TutorCourse[];
  upcomingSessions: TutorSession[];
  pendingTickets: { id: string; type: string; reason: string }[];
  counts: { courses: number; activeGroups: number; sessionsThisWeek: number; pendingTickets: number };
};

export type TutorParticipant = {
  userId: string;
  name: string;
  email: string;
  enrollmentType: "direct" | "group" | "both";
  enrolledAt: string | null;
  expiresAt: string | null;
  groups: { id: string; name: string; role: "leader" | "member" }[];
};

export type TutorGroup = {
  id: string;
  name: string;
  packageName: string;
  usedQuotaSessions: number;
  totalQuotaSessions: number;
  membersCount: number;
  members: { userId: string; name: string; email: string; role: "leader" | "member" }[];
};

export type TutorParticipants = {
  course: TutorCourse;
  participants: TutorParticipant[];
  groups: TutorGroup[];
};

export type TutorSubmission = {
  id: string;
  reviewRevision?: string;
  studentName: string | null;
  studentEmail: string | null;
  examTitle: string;
  status: "completed" | "pending_review" | "graded" | "late";
  score: number | null;
  teacherNotes: string | null;
  questionsSnapshot: unknown;
  answersSnapshot: unknown;
  submittedAt: string | null;
};

export type TutorGrading = { course: TutorCourse; submissions: TutorSubmission[] };
export type TutorGrade = { score: number; notes: string };

export type TutorConcept = {
  conceptName: string;
  avgMastery: number;
  studentCount: number;
  bucketLow: number;
  bucketMid: number;
  bucketHigh: number;
};

export type TutorAnalytics = {
  courseTitle: string;
  enrolledCount: number;
  activeCount: number;
  weakConcepts: TutorConcept[];
  allConcepts: TutorConcept[];
  interventionCounts: { conceptName: string; count: number }[];
};

export type TutorDataSource = {
  support?: TutorSupportClient;
  dashboard(signal: AbortSignal): Promise<TutorDashboard>;
  participants(courseId: string, signal: AbortSignal): Promise<TutorParticipants>;
  grading(courseId: string, signal: AbortSignal): Promise<TutorGrading>;
  analytics?(courseId: string, signal: AbortSignal): Promise<TutorAnalytics>;
  refreshAnalytics?(courseId: string, signal: AbortSignal): Promise<void>;
  saveGrade?(courseId: string, submissionId: string, grade: TutorGrade): Promise<void>;
} & ({ fixture: true; repository: TutorFixtureRepository } | { fixture?: false });

export class TutorDataError extends Error {
  constructor(public readonly status: number) {
    super(`Tutor data request failed (${status})`);
  }
}

export function matchesCourse(course: TutorCourse, courseId: string) {
  return course.courseId === courseId || course.legacyCourseId === courseId;
}

export function filterParticipants(participants: TutorParticipant[], search: string, access: string) {
  const term = search.trim().toLowerCase();
  return participants.filter((participant) =>
    (access === "all" || participant.enrollmentType === access) &&
    [participant.name, participant.email, ...participant.groups.map((group) => group.name)]
      .some((value) => value.toLowerCase().includes(term)),
  );
}

export function filterGroups(groups: TutorGroup[], search: string) {
  const term = search.trim().toLowerCase();
  return groups.filter((group) =>
    [group.name, group.packageName, ...group.members.flatMap((member) => [member.name, member.email])]
      .some((value) => value.toLowerCase().includes(term)),
  );
}

export function parseGrade(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const score = Number(trimmed);
  return score <= 100 ? score : null;
}

type TryoutQuestion = {
  id: string;
  type: string;
  prompt: string;
  options?: string[];
  correctIndex?: number;
  correctIndices?: number[];
  acceptableAnswers?: string[];
};

type TryoutAnswer = {
  index?: number;
  indices?: number[];
  text?: string;
  fileName?: string;
};

function decodeSnapshot(snapshot: unknown): unknown {
  if (typeof snapshot !== "string") return snapshot;
  try {
    return JSON.parse(snapshot);
  } catch {
    return null;
  }
}

function isQuestion(value: unknown): value is TryoutQuestion {
  if (!value || typeof value !== "object") return false;
  const question = value as TryoutQuestion;
  return typeof question.id === "string" &&
    typeof question.type === "string" &&
    typeof question.prompt === "string";
}

export function readAnswers(submission: TutorSubmission) {
  const questions = decodeSnapshot(submission.questionsSnapshot);
  const answers = decodeSnapshot(submission.answersSnapshot);
  const choices = answers && typeof answers === "object" && !Array.isArray(answers)
    ? answers as Record<string, unknown>
    : {};
  return (Array.isArray(questions) ? questions.filter(isQuestion) : []).map((question) => {
    const value = Object.hasOwn(choices, question.id) ? choices[question.id] : undefined;
    const answer: TryoutAnswer = value && typeof value === "object" ? value as TryoutAnswer : {};
    const multiple = question.type === "multiple_choices";
    const chosen = multiple ? (Array.isArray(answer.indices) ? answer.indices : []) : [answer.index];
    const correct = multiple ? (Array.isArray(question.correctIndices) ? question.correctIndices : []) : [question.correctIndex];
    return {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      text: typeof answer.text === "string" ? answer.text : "",
      fileName: typeof answer.fileName === "string" ? answer.fileName : "",
      accepted: Array.isArray(question.acceptableAnswers)
        ? question.acceptableAnswers.filter((entry) => typeof entry === "string")
        : [],
      options: (Array.isArray(question.options) ? question.options : []).flatMap((label, index) =>
        typeof label === "string" ? [{ label, chosen: chosen.includes(index), correct: correct.includes(index) }] : [],
      ),
    };
  });
}
