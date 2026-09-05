/**
 * Mock course domain for student UI until APIs + Drizzle back these routes.
 * Replace with TanStack Query + fetch when ready.
 */

export type MaterialKind = "article" | "pdf" | "image" | "video" | "link" | "quiz" | "tryout";
export type DocCategory = "materi" | "soal" | "solusi" | "diktat";

export type CourseMaterial = {
 id: string;
 courseId: string;
 title: string;
 kind: MaterialKind;
 docCategory?: DocCategory;
 tabGroup?: "materi" | "diktat" | "pdf" | "bank_soal";
 subcategory?: string | null;
 year?: number | null;
 fileSize?: string;
 /** Custom navigation link (e.g. for interactive quizzes/tryouts) */
 href?: string;
 /** Article: plain text / markdown-ish paragraphs separated by \n\n */
 body?: string;
 /** pdf | image | video | link */
 url?: string;
 /** Mock: completed by demo student */
 completed: boolean;
 isPastYear?: boolean;
 isPreview?: boolean;
 /** Chapter this material belongs to, when known (enables P3 chapter summary). */
 chapterId?: string;
 chapterIds?: string[] | null;
 /** Thumbnail image URL / R2 path for page-1 document preview */
 thumbnailUrl?: string;
};

export type ExamType = "quiz" | "tryout";
export type ExamStatus = "draft" | "published" | "ended";


export type QuestionType =
 | "short_answer"
 | "multiple_choice"
 | "multiple_choices"
 | "essay";

export type QuestionProvenanceSpec = {
 origin?: "zyx_original" | "itb_example";
 sourceEventName?: string | null;
 sourceReferenceId?: string | null;
};

export type QuestionSpec = QuestionProvenanceSpec & (
 | {
 id: string;
 order: number;
 type: "short_answer";
 prompt: string;
 acceptsImage?: boolean;
 /** For auto-grade mock */
 acceptableAnswers?: string[];
 }
 | {
 id: string;
 order: number;
 type: "multiple_choice";
 prompt: string;
 options: string[];
 correctIndex: number;
 }
 | {
 id: string;
 order: number;
 type: "multiple_choices";
 prompt: string;
 options: string[];
 correctIndices: number[];
 }
 | {
 id: string;
 order: number;
 type: "essay";
 prompt: string;
 acceptsFile?: boolean;
 });

export type ExamFixture = {
 id: string;
 courseId: string;
 title: string;
 type: ExamType;
 status: ExamStatus;
 isFree?: boolean;
 /** Mirrors jsonb settings on exams */
 settings?: {
 maxAttempts?: number;
 timeLimitMinutes?: number;
 oneTimeOnly?: boolean;
 };
 questions: QuestionSpec[];
 isPastYear?: boolean;
 isPreview?: boolean;
};

export type LeaderboardEntry = {
 rank: number;
 userId: string;
 displayName: string;
 score: number;
 quizAvgPercent: number;
 tryoutAvgPercent: number;
};

export type SubmissionListItem = {
 id: string;
 courseId: string;
 examId: string;
 examTitle: string;
 examType: ExamType;
 status: "completed" | "pending_review" | "graded" | "late";
 score: number | null;
 submittedAt: string;
};

export type ReviewItem = {
 questionId: string;
 prompt: string;
 questionType: QuestionType;
 userAnswer: string;
 correct: boolean | null;
 correctAnswerLabel?: string;
 teacherNote?: string | null;
 explanationText?: string;
 explanationImage?: string;
 explanationVideoUrl?: string;
 explanationVideoKind?: "youtube" | "r2";
 origin?: "zyx_original" | "itb_example";
 sourceEventName?: string | null;
 sourceReferenceId?: string | null;
};

export type SubmissionReviewFixture = {
 id: string;
 courseId: string;
 examId: string;
 examTitle: string;
 examType: ExamType;
 items: ReviewItem[];
};

export type StudentCourse = {
 id: string;
 title: string;
 category: string;
 description: string;
};

export const LEADERBOARD_SCORE_HINT =
 "Skor papan peringkat = rata-rata % semua kuis + (rata-rata % tryout × 2).";

const courses: StudentCourse[] = [];

const materials: CourseMaterial[] = [];

export const exams: ExamFixture[] = [];

const leaderboardByCourse: Record<string, LeaderboardEntry[]> = {};

const submissionList: SubmissionListItem[] = [];

const submissionReviews: SubmissionReviewFixture[] = [];

export function listCourses(): StudentCourse[] {
 return courses;
}

export function getCourseById(id: string): StudentCourse | undefined {
 return courses.find((c) => c.id === id);
}

export function getMaterialsForCourse(courseId: string): CourseMaterial[] {
 return materials.filter((m) => m.courseId === courseId);
}

export function getMaterial(courseId: string, materialId: string): CourseMaterial | undefined {
 return materials.find((m) => m.courseId === courseId && m.id === materialId);
}

export function getExamsForCourse(courseId: string, type: ExamType): ExamFixture[] {
 return exams.filter((e) => e.courseId === courseId && e.type === type);
}

export function getExamById(
 courseId: string,
 examId: string,
): ExamFixture | undefined {
 return exams.find((e) => e.courseId === courseId && e.id === examId);
}

export function getLeaderboard(courseId: string): LeaderboardEntry[] {
 return leaderboardByCourse[courseId] ?? [];
}

export function getSubmissionsForCourse(courseId: string): SubmissionListItem[] {
 return submissionList.filter((s) => s.courseId === courseId);
}

export function getSubmissionListItem(
 courseId: string,
 submissionId: string,
): SubmissionListItem | undefined {
 return submissionList.find((s) => s.courseId === courseId && s.id === submissionId);
}

export function getSubmissionReview(
 courseId: string,
 submissionId: string,
): SubmissionReviewFixture | undefined {
 return submissionReviews.find((r) => r.courseId === courseId && r.id === submissionId);
}
