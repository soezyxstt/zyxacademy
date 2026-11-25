import type { ComponentProps, ReactNode } from "react";
import type { DashboardWeakConcepts } from "@/components/course/dashboard-weak-concepts";

export type StudentDashboardEnrollment = {
  id: string;
  title: string;
  category: string;
};

export type StudentDashboardCourseProgress = {
  doneCount: number;
  total: number;
  nextConcept?: string;
};

export type StudentDashboardDocument = {
  id: string;
  title: string;
  kind: string;
  courseId: string;
  courseTitle: string;
  completionPercent: number;
  lastSectionId?: string | null;
  href?: string;
};

export type StudentDashboardRecommendedCourse = {
  id: string;
  title: string;
  category: string;
  materialsCount: number;
};

export type StudentDashboardRecentReview = {
  id: string;
  front: string;
  grade: number;
  reviewedAt: Date | string;
  courseTitle: string;
};

export type StudentDashboardExam = {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  type: string;
};

export type StudentDashboardDataProps = {
  href?: (path: string) => string;
  enrollments: StudentDashboardEnrollment[];
  courseProgress: Record<string, StudentDashboardCourseProgress>;
  inProgressDocuments: StudentDashboardDocument[];
  recommendedUnenrolledCourses: StudentDashboardRecommendedCourse[];
  studentTargetCategory: string | null;
  totalDueFlashcards: number;
  firstCourseWithQueue?: string;
  recentReviews: StudentDashboardRecentReview[];
  masteryConcepts: ComponentProps<typeof DashboardWeakConcepts>["concepts"];
  masterySection?: ReactNode;
  availableExams: StudentDashboardExam[];
  activateClassAction: ReactNode;
};

export type StreamedStudentDashboardSlots = {
  primary?: ReactNode;
  secondary?: ReactNode;
  todayPlan?: ReactNode;
  gamification?: ReactNode;
  activeAndReading?: ReactNode;
  recommendedCourses?: ReactNode;
  reviewQueue?: ReactNode;
  weakConcepts?: ReactNode;
  availableAssessments?: ReactNode;
};

export type StreamedStudentDashboardContentProps = {
  sections: StreamedStudentDashboardSlots;
};

export type StudentDashboardViewProps =
  | StudentDashboardDataProps
  | StreamedStudentDashboardContentProps;

export const REVIEW_GRADE_LABELS: Record<number, string> = {
  1: "gradeAgain",
  2: "gradeHard",
  3: "gradeGood",
  4: "gradeEasy",
};

export const REVIEW_GRADE_TONES: Record<number, string> = {
  1: "text-status-error bg-status-error/10 border-status-error/20",
  2: "text-brand-secondary bg-brand-secondary/10 border-brand-secondary/20",
  3: "text-brand-primary bg-brand-primary/10 border-brand-primary/20",
  4: "text-status-success bg-status-success/10 border-status-success/20",
};
