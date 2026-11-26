export type AssessmentActor = { id: string; role: "tutor" | "admin" | "student" };
export type AssessmentScenario = "populated" | "empty" | "error";
export type CourseScope = { kind: "tutor"; courseId: string } | { kind: "admin"; slug: string };
export type AssessmentContext = { actor: AssessmentActor; scope: CourseScope; scenario: AssessmentScenario };
export type AssessmentCourse = { id: string; slug: string; title: string };
export type Versioned = { id: string; revision: number };
export type VersionRef = { id: string; expectedRevision: number };

export const quizCategories = {
  daily: "Harian", weekly: "Mingguan", chapter: "Bab", premium: "Premium", simulation: "Simulasi",
};
export const questionTypes = {
  multiple_choice: "Pilihan ganda", multiple_choices: "Pilihan ganda kompleks", short_answer: "Isian singkat", essay: "Esai",
};
export const difficulties = { easy: "Mudah", medium: "Sedang", hard: "Sulit" };
export type QuizCategory = keyof typeof quizCategories;
export type QuestionType = keyof typeof questionTypes;
export type Difficulty = keyof typeof difficulties;
export type QuizStatus = "draft" | "published";
export type ExplanationRelease = "immediate" | "after_close" | "never";
export type QuizSelection =
  | { mode: "specific"; questionIds: string[] }
  | { mode: "distribution"; count: number; difficulty: Record<Difficulty, number>; tags: string[] };

export interface QuizInput {
  title: string;
  category: QuizCategory;
  visibility: "free" | "paid";
  status: QuizStatus;
  manualStatus: "open" | "closed" | "scheduled";
  openAt: string | null;
  closeAt: string | null;
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  selection: QuizSelection;
  settings: {
    canGoBack: boolean;
    requireAllAnswered: boolean;
    explanationRelease: ExplanationRelease;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    showScoreImmediate: boolean;
    passingScore: number | null;
    perQuestionTimerEnabled: boolean;
    defaultQuestionTimerSeconds: number;
    perQuestionTimers: Record<string, number>;
  };
}

export type AssessmentQuiz = QuizInput & Versioned & {
  courseId: string;
  creatorName: string;
  effectiveType: "quiz" | "tryout";
};

export interface QuestionInput {
  prompt: string;
  type: QuestionType;
  options: string[];
  correctIndices: number[];
  acceptableAnswers: string[];
}

export type BankQuestionInput = QuestionInput & {
  difficulty: Difficulty;
  explanation: string;
  tags: string[];
};

export type BankQuestion = BankQuestionInput & Versioned & {
  origin: "zyx_original" | "itb_example" | "historical_reference";
  sourceEventName?: string;
  quizSelectable?: boolean;
  reviewStatus?: "generated" | "reviewed" | "published" | "flagged" | "retired";
  bankRevision?: string;
};

export interface TryoutInput {
  title: string;
  status: "draft" | "published" | "ended";
  timeLimitMinutes: number;
  maxAttempts: number;
  openAt: string | null;
  closeAt: string | null;
}

export type TryoutQuestionInput = QuestionInput & { order: number; acceptsFile: boolean };
export type TryoutQuestion = TryoutQuestionInput & Versioned & { bankQuestionId?: string };
export type AssessmentTryout = TryoutInput & Versioned & { questions: TryoutQuestion[]; metadataRevision?: string; questionSetRevision?: string; authoringRevision?: string; canDelete?: boolean };
export type TryoutBankChoice = Pick<BankQuestion, "id" | "prompt" | "type" | "difficulty" | "tags">;

export type QuizAttemptSummary = {
  id: string;
  templateId: string;
  quizTitle: string;
  studentName: string;
  studentEmail: string;
  submittedAt: string | null;
  durationSeconds: number;
  score: number | null;
  status: "in_progress" | "pending" | "graded" | "abandoned";
  remainingEssays: number;
};
export type GradingAnswer = {
  questionId: string;
  prompt: string;
  type: QuestionType;
  submittedAnswer: string;
  attachmentLabel?: string;
  attachmentAvailable?: boolean;
  automaticScore: number | null;
  reviewScore: number | null;
  reviewNotes: string;
  revision: number;
};
export type QuizAttempt = QuizAttemptSummary & { answers: GradingAnswer[] };
export type QuizAttemptSnapshot = QuizAttemptSummary & {
  startedAt?: string | null;
  questions: Array<{ id: string; prompt: string; answer: string; answerKey?: string; options?: string[] }>;
};

export function filterQuizAttempts<T extends QuizAttemptSummary>(attempts: T[], search: string,
  status: QuizAttemptSummary["status"] | "all", includeInProgress: boolean): T[] {
  const needle = search.trim().toLowerCase();
  return attempts.filter(attempt => (includeInProgress || attempt.status !== "in_progress") &&
    (status === "all" || status === attempt.status) &&
    [attempt.quizTitle, attempt.studentName, attempt.studentEmail].join(" ").toLowerCase().includes(needle));
}
export type QuizAttemptsSheet = {
  quizTitle: string;
  attempts: QuizAttemptSnapshot[];
};
export type GradeItem = { questionId: string; score: number; reviewNotes: string | null; expectedRevision: number };

export type QuizCollection = { course: AssessmentCourse; quizzes: AssessmentQuiz[]; bank: BankQuestion[]; canWriteBank?: boolean };
export type QuizPreviewQuestion = QuestionInput & Versioned & { explanation?: string };
export type TryoutCollection = { course: AssessmentCourse; tryouts: AssessmentTryout[]; bank: TryoutBankChoice[]; canSaveDraft?: boolean; canSaveMetadata?: boolean; canManageContent?: boolean };

export type AssessmentErrorCode = "forbidden" | "not_found" | "invalid" | "conflict" | "unavailable";
export type AssessmentResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: AssessmentErrorCode; message: string };

type BankVersionRef = VersionRef & { bankRevision?: string };

type TryoutMetadataCommand = { target: (VersionRef & { metadataRevision?: string }) | null; input: TryoutInput; courseId?: string };

export type AssessmentCommand =
  | { kind: "quiz.save"; target: VersionRef | null; input: QuizInput; courseId?: string }
  | { kind: "quiz.status"; target: VersionRef; status: QuizStatus; courseId?: string }
  | { kind: "quiz.delete"; target: VersionRef; courseId?: string }
  | { kind: "bank.save"; target: BankVersionRef | null; input: BankQuestionInput; courseId?: string }
  | { kind: "bank.delete"; target: BankVersionRef; courseId?: string }
  | (TryoutMetadataCommand & { kind: "tryout.save" })
  | (TryoutMetadataCommand & { kind: "tryout.metadata.save" })
  | { kind: "tryout.delete"; target: VersionRef; courseId?: string; authoringRevision?: string }
  | { kind: "tryout.question.save"; examId: string; target: VersionRef | null; input: TryoutQuestionInput; courseId?: string; authoringRevision?: string }
  | { kind: "tryout.question.delete"; examId: string; target: VersionRef; courseId?: string; questionSetRevision?: string; authoringRevision?: string }
  | { kind: "tryout.question.import"; exam: VersionRef; bankIds: string[]; courseId?: string; questionSetRevision?: string }
  | { kind: "grading.save"; attemptId: string; items: GradeItem[]; finalize: boolean };

export type BankWriteCommand = Extract<AssessmentCommand, { kind: "bank.save" | "bank.delete" }>;
export type OutstandingBankWrite = { requestId: string; command: BankWriteCommand; confirmed: boolean };

export type OutstandingQuizSave = {
  requestId: string;
  command: Extract<AssessmentCommand, { kind: "quiz.save" }>;
  confirmed: boolean;
};
export type QuizGradeCommand = Extract<AssessmentCommand, { kind: "grading.save" }>;
export type OutstandingQuizGrade = { requestId: string; command: QuizGradeCommand };
export type TryoutDraftCommand = Extract<AssessmentCommand, { kind: "tryout.save" | "tryout.metadata.save" | "tryout.delete" | "tryout.question.save" | "tryout.question.import" | "tryout.question.delete" }>;

export type MutationEffect = {
  id: string;
  message: string;
  imported?: number;
  skipped?: number;
  gradingStatus?: "pending" | "graded";
};

export interface AssessmentGateway {
  readonly canMutate: boolean;
  readonly canGrade: boolean;
  readonly canSaveQuiz: boolean;
  readonly canSaveTryoutDraft: boolean;
  readonly canSaveTryoutMetadata?: boolean;
  readonly canManageTryoutContent?: boolean;
  readonly canWriteBank?: boolean;
  pendingBankWrite?(context: AssessmentContext): OutstandingBankWrite | null;
  confirmBankWrite?(context: AssessmentContext, requestId: string): void;
  pendingTryoutDraft?(context: AssessmentContext): { requestId: string; command: TryoutDraftCommand; confirmed: boolean } | null;
  confirmTryoutDraft?(context: AssessmentContext, requestId: string): void;
  takeQuizSaveNotice?(context: AssessmentContext, requestId: string): string | null;
  pendingQuizSave?(context: AssessmentContext, quizId: string | null): OutstandingQuizSave | null;
  pendingQuizGrade?(context: AssessmentContext): OutstandingQuizGrade | null;
  confirmQuizGrade?(context: AssessmentContext, requestId: string): void;
  listQuizzes(context: AssessmentContext, signal?: AbortSignal): Promise<AssessmentResult<QuizCollection>>;
  previewQuiz(context: AssessmentContext, id: string, signal?: AbortSignal): Promise<AssessmentResult<QuizPreviewQuestion[]>>;
  listQuizAttempts(context: AssessmentContext, quizId: string, signal?: AbortSignal): Promise<AssessmentResult<QuizAttemptsSheet>>;
  pendingGrading(context: AssessmentContext, signal?: AbortSignal): Promise<AssessmentResult<QuizAttemptSummary[]>>;
  loadGradingAttempt(context: AssessmentContext, id: string, signal?: AbortSignal): Promise<AssessmentResult<QuizAttempt>>;
  listTryouts(context: AssessmentContext, signal?: AbortSignal): Promise<AssessmentResult<TryoutCollection>>;
  mutate(context: AssessmentContext, requestId: string, command: AssessmentCommand, signal?: AbortSignal): Promise<AssessmentResult<MutationEffect>>;
}

export const targetVersion = ({ id, revision }: Versioned): VersionRef => ({ id, expectedRevision: revision });
export const canEditQuiz = (role: "admin" | "tutor", quiz: Pick<AssessmentQuiz, "category" | "effectiveType">) =>
  role === "admin" || (quiz.category !== "simulation" && quiz.effectiveType === "quiz");

export function defaultQuiz(role: "admin" | "tutor", tags: string[] = []): QuizInput {
  return {
    title: "", category: "weekly", visibility: "free", status: "draft",
    manualStatus: role === "admin" ? "scheduled" : "open",
    openAt: null, closeAt: null, timeLimitSeconds: 1800, maxAttempts: null,
    selection: role === "admin"
      ? { mode: "distribution", count: 10, difficulty: { easy: 3, medium: 5, hard: 2 }, tags }
      : { mode: "specific", questionIds: [] },
    settings: {
      canGoBack: true, requireAllAnswered: false, explanationRelease: "after_close",
      shuffleQuestions: false, shuffleOptions: false, showScoreImmediate: true, passingScore: 70,
      perQuestionTimerEnabled: false, defaultQuestionTimerSeconds: 60, perQuestionTimers: {},
    },
  };
}

export function commaList(text: string): string[] {
  return [...new Set(text.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function dateRangeError(openAt: string | null, closeAt: string | null): string | undefined {
  if ([openAt, closeAt].some((date) => date && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(date))) return "Masukkan tanggal dengan zona waktu.";
  const open = openAt ? Date.parse(openAt) : null;
  const close = closeAt ? Date.parse(closeAt) : null;
  if (Number.isNaN(open) || Number.isNaN(close)) return "Masukkan tanggal dengan zona waktu.";
  if (open !== null && close !== null && close <= open) return "Waktu tutup harus sesudah waktu buka.";
}

export function quizValidationError(input: QuizInput, bank: readonly BankQuestion[]): string | undefined {
  const { selection, settings } = input;
  if (!input.title.trim()) return "Judul kuis wajib diisi.";
  if (input.maxAttempts !== null && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1)) return "Batas percobaan minimal 1.";
  if (input.timeLimitSeconds !== null && (!Number.isInteger(input.timeLimitSeconds) || input.timeLimitSeconds < 1)) return "Durasi kuis harus lebih dari 0.";
  if (settings.passingScore !== null && (!Number.isFinite(settings.passingScore) || settings.passingScore < 0 || settings.passingScore > 100)) return "Nilai lulus harus antara 0 dan 100.";

  let timerTotal: number;
  if (selection.mode === "specific") {
    const { questionIds } = selection;
    if (!questionIds.length) return "Pilih minimal satu soal.";
    const bankIds = new Set(bank.map(({ id }) => id));
    if (new Set(questionIds).size !== questionIds.length || questionIds.some(id => !bankIds.has(id))) {
      return "Periksa pilihan soal dari bank soal kursus ini.";
    }
    timerTotal = questionIds.reduce((total, id) => total + (settings.perQuestionTimers[id] ?? settings.defaultQuestionTimerSeconds), 0);
  } else {
    const counts = Object.values(selection.difficulty);
    if (!Number.isInteger(selection.count) || selection.count < 1 || counts.some((count) => !Number.isInteger(count) || count < 0)) {
      return "Masukkan jumlah soal dan pembagian tingkat kesulitan yang valid.";
    }
    if (counts.reduce((total, count) => total + count, 0) !== selection.count) return "Jumlah per tingkat kesulitan harus sama dengan jumlah soal.";
    timerTotal = selection.count * settings.defaultQuestionTimerSeconds;
  }
  if (settings.perQuestionTimerEnabled) {
    const timers = [settings.defaultQuestionTimerSeconds, ...Object.values(settings.perQuestionTimers)];
    if (timers.some((seconds) => !Number.isInteger(seconds) || seconds < 1)) return "Timer soal minimal 1 detik.";
    if (input.timeLimitSeconds !== null && timerTotal !== input.timeLimitSeconds) {
      return `Total timer soal (${timerTotal} detik) harus sama dengan durasi kuis (${input.timeLimitSeconds} detik).`;
    }
  }
  return dateRangeError(input.openAt, input.closeAt);
}

export function questionValidationError(input: QuestionInput): string | undefined {
  if (!input.prompt.trim()) return "Pertanyaan wajib diisi.";
  if (input.type === "short_answer" && !input.acceptableAnswers.some((answer) => answer.trim())) return "Isi minimal satu jawaban yang diterima.";
  if (input.type !== "multiple_choice" && input.type !== "multiple_choices") return;
  if (input.options.filter((option) => option.trim()).length < 2) return "Isi minimal dua opsi jawaban.";
  if (input.correctIndices.some((index) => !Number.isInteger(index) || !input.options[index]?.trim())) return "Lengkapi opsi yang dipilih sebagai jawaban.";
  if (input.type === "multiple_choice" && input.correctIndices.length !== 1) return "Pilih satu jawaban benar.";
  if (input.type === "multiple_choices" && input.correctIndices.length < 1) return "Pilih minimal satu jawaban benar.";
}

export function canGrade(type: QuestionType): boolean {
  return type === "essay" || type === "short_answer";
}
