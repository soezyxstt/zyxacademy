import {
  canEditQuiz, canGrade, dateRangeError, defaultQuiz, questionValidationError, quizValidationError,
  type AssessmentActor, type AssessmentCommand, type AssessmentContext, type AssessmentCourse,
  type AssessmentErrorCode, type AssessmentGateway, type AssessmentQuiz, type AssessmentResult,
  type AssessmentScenario, type AssessmentTryout, type BankQuestion, type MutationEffect, type QuizAttempt,
  type QuizAttemptSummary, type Versioned, type VersionRef,
} from "./model";

export const assessmentCourses: readonly AssessmentCourse[] = [
  { id: "academic-course-1", slug: "biologi-dasar", title: "Biologi Dasar" },
  { id: "academic-course-2", slug: "fisika-dasar", title: "Fisika Dasar" },
  { id: "academic-course-3", slug: "kimia-dasar", title: "Kimia Dasar" },
];

export const assessmentActors = {
  tutor: { id: "academic-tutor", role: "tutor" },
  admin: { id: "academic-admin", role: "admin" },
} as const satisfies Record<string, AssessmentActor>;

export function makeAssessmentFixture() {
  const courseId = assessmentCourses[0].id;
  const bank: BankQuestion[] = [
    {
      id: "academic-question-1", revision: 1, origin: "zyx_original", type: "multiple_choice", difficulty: "easy",
      prompt: "Organel apa yang menghasilkan sebagian besar ATP pada sel eukariotik?",
      options: ["Mitokondria", "Ribosom", "Badan Golgi", "Lisosom"], correctIndices: [0], acceptableAnswers: [],
      tags: ["sel"], explanation: "Rantai transpor elektron berlangsung pada membran dalam mitokondria.",
    },
    {
      id: "academic-question-2", revision: 1, origin: "zyx_original", type: "essay", difficulty: "medium",
      prompt: "Jelaskan hubungan struktur membran sel dengan fungsinya.",
      options: [], correctIndices: [], acceptableAnswers: [], tags: ["sel"],
      explanation: "Bilayer fosfolipid membentuk batas selektif. Protein membentuk saluran dan reseptor.",
    },
    {
      id: "academic-question-3", revision: 1, origin: "itb_example", sourceEventName: "Latihan Biologi",
      type: "short_answer", difficulty: "medium",
      prompt: "Proses apa yang menghasilkan dua sel anak dengan jumlah kromosom yang sama?",
      options: [], correctIndices: [], acceptableAnswers: ["mitosis"], tags: ["genetika"],
      explanation: "Mitosis mempertahankan jumlah kromosom pada sel anak.",
    },
  ];
  const quizzes: AssessmentQuiz[] = [
    {
      ...defaultQuiz("tutor"), id: "academic-quiz-1", revision: 1, courseId, title: "Kuis struktur sel",
      creatorName: "Tutor Biologi", effectiveType: "quiz", status: "published",
      selection: { mode: "specific", questionIds: [bank[0].id, bank[1].id] },
    },
    {
      ...defaultQuiz("tutor"), id: "academic-quiz-2", revision: 1, courseId, title: "Latihan genetika",
      creatorName: "Tutor Biologi", effectiveType: "quiz", category: "chapter",
      selection: { mode: "specific", questionIds: [bank[2].id] },
    },
    {
      ...defaultQuiz("admin"), id: "academic-quiz-simulation", revision: 1, courseId, title: "Simulasi biologi dasar",
      creatorName: "Admin Akademik", effectiveType: "tryout", category: "simulation", status: "published",
      selection: { mode: "specific", questionIds: [bank[0].id, bank[2].id] },
    },
  ];
  const tryouts: AssessmentTryout[] = [
    {
      id: "academic-tryout-1", revision: 1, title: "Tryout biologi dasar", status: "draft",
      timeLimitMinutes: 90, maxAttempts: 2, openAt: null, closeAt: null,
      questions: [{
        id: "academic-tryout-question-1", revision: 1, bankQuestionId: bank[0].id,
        prompt: bank[0].prompt, type: bank[0].type, options: [...bank[0].options],
        correctIndices: [...bank[0].correctIndices], acceptableAnswers: [], order: 1, acceptsFile: false,
      }],
    },
  ];
  const attempts: QuizAttempt[] = [
    {
      id: "academic-quiz-attempt-1", templateId: quizzes[0].id, quizTitle: quizzes[0].title,
      studentName: "Maya Putri", studentEmail: "maya@example.test", submittedAt: "2026-11-20T09:10:00.000Z",
      durationSeconds: 540, status: "pending", score: null, remainingEssays: 1,
      answers: [
        { questionId: bank[0].id, prompt: bank[0].prompt, type: bank[0].type, submittedAnswer: "Mitokondria", automaticScore: 100, reviewScore: null, reviewNotes: "", revision: 0 },
        { questionId: bank[1].id, prompt: bank[1].prompt, type: bank[1].type, submittedAnswer: "Membran sel mengatur zat yang masuk dan keluar karena tersusun dari bilayer fosfolipid dan protein.", automaticScore: null, reviewScore: null, reviewNotes: "", revision: 0 },
        { questionId: bank[2].id, prompt: bank[2].prompt, type: bank[2].type, submittedAnswer: "Mitosis", automaticScore: 100, reviewScore: null, reviewNotes: "", revision: 0 },
      ],
    },
    {
      id: "academic-quiz-attempt-2", templateId: quizzes[0].id, quizTitle: quizzes[0].title,
      studentName: "Arif Rahman", studentEmail: "arif@example.test", submittedAt: "2026-11-20T08:45:00.000Z",
      durationSeconds: 720, status: "graded", score: 90, remainingEssays: 0, answers: [],
    },
    {
      id: "academic-quiz-attempt-3", templateId: quizzes[0].id, quizTitle: quizzes[0].title,
      studentName: "Sinta Dewi", studentEmail: "sinta@example.test", submittedAt: null,
      durationSeconds: 0, status: "in_progress", score: null, remainingEssays: 0, answers: [],
    },
  ];
  return { bank, quizzes, tryouts, attempts };
}

type FixtureRecords = ReturnType<typeof makeAssessmentFixture>;
type FixtureCourse = { course: AssessmentCourse } & FixtureRecords;
type MutationResult = AssessmentResult<MutationEffect>;

class FixtureError extends Error {
  constructor(public readonly code: AssessmentErrorCode, message: string) {
    super(message);
  }
}

function deny(code: AssessmentErrorCode, message: string): never {
  throw new FixtureError(code, message);
}

function record<T extends { id: string }>(rows: T[], id: string, label: string): T {
  return rows.find((entry) => entry.id === id) ?? deny("not_found", `${label} tidak ditemukan di kursus ini.`);
}

function checked<T extends Versioned>(rows: T[], target: VersionRef, label: string): T {
  const row = record(rows, target.id, label);
  if (row.revision !== target.expectedRevision) deny("conflict", `${label} telah berubah. Muat versi terbaru sebelum menyimpan.`);
  return row;
}

function replace<T extends { id: string }>(rows: T[], row: T) {
  const index = rows.findIndex((item) => item.id === row.id);
  if (index < 0) rows.push(row);
  else rows[index] = row;
}

function remove<T>(rows: T[], item: T) {
  rows.splice(rows.indexOf(item), 1);
}

function success(id: string, message: string): MutationEffect {
  return { id, message };
}

function toAttemptSummary({ answers: _answers, ...summary }: QuizAttempt): QuizAttemptSummary {
  return summary;
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)])) as T;
  }
  return value;
}

export function createAssessmentFixtureGateway(): AssessmentGateway {
  const records = new Map<string, FixtureCourse>();
  const failed = new Set<string>();
  const completed = new Map<string, { fingerprint: string; result: MutationResult; quizSaveNotice?: string }>();
  let sequence = 0;

  function accessibleCourse({ actor, scope }: AssessmentContext): AssessmentCourse {
    const authorized = scope.kind === "admin"
      ? actor.role === "admin" && actor.id === assessmentActors.admin.id
      : actor.role === "tutor" && actor.id === assessmentActors.tutor.id;
    if (!authorized) deny("forbidden", "Akun ini tidak memiliki akses ke halaman penilaian.");
    const course = assessmentCourses.find((entry) => scope.kind === "admin" ? entry.slug === scope.slug : entry.id === scope.courseId);
    if (!course) deny("not_found", "Kursus tidak ditemukan.");
    if (scope.kind === "tutor" && course.id === assessmentCourses[2].id) deny("forbidden", "Kursus ini berada di luar penugasan tutor Anda.");
    return course;
  }

  function resolveCourse(course: AssessmentCourse, scenario: AssessmentScenario): FixtureCourse {
    const key = `${scenario}:${course.id}`;
    const existing = records.get(key);
    if (existing) return existing;
    const populated = scenario !== "empty" && course.id === assessmentCourses[0].id;
    const data = populated ? makeAssessmentFixture() : { bank: [], quizzes: [], tryouts: [], attempts: [] };
    const seeded = { course, ...data };
    records.set(key, seeded);
    return seeded;
  }

  function authorize(context: AssessmentContext, role?: "tutor" | "admin") {
    if (role && context.scope.kind !== role) deny("forbidden", "Akun ini tidak diizinkan menjalankan operasi ini.");
    return accessibleCourse(context);
  }

  function failOnce(scenario: AssessmentScenario, key: string) {
    if (scenario === "error" && !failed.has(key)) {
      failed.add(key);
      deny("unavailable", "Layanan penilaian sementara tidak dapat diakses. Coba lagi.");
    }
  }

  async function result<T>(getValue: () => T): Promise<AssessmentResult<T>> {
    try {
      return { ok: true, value: clone(getValue()) };
    } catch (error) {
      if (error instanceof FixtureError) return { ok: false, code: error.code, message: error.message };
      throw error;
    }
  }

  function read<T>(context: AssessmentContext, operation: string, getValue: (data: FixtureCourse) => T, role?: "tutor" | "admin") {
    return result(() => {
      const course = authorize(context, role);
      failOnce(context.scenario, `${context.actor.id}:${course.id}:read:${operation}`);
      return getValue(resolveCourse(course, context.scenario));
    });
  }

  function mutationKey(context: AssessmentContext, courseId: string, requestId: string) {
    return `${context.scenario}:${context.actor.id}:${courseId}:write:${requestId}`;
  }

  function newId(kind: string) {
    return `academic-${kind}-new-${++sequence}`;
  }

  function mutateRecords(data: FixtureCourse, role: "tutor" | "admin", command: AssessmentCommand): MutationEffect {
    switch (command.kind) {
      case "quiz.save": {
        const existing = command.target ? checked(data.quizzes, command.target, "Kuis") : undefined;
        const input = command.input;
        if (existing && !canEditQuiz(role, existing)) deny("forbidden", "Kuis simulasi hanya dapat diubah oleh admin.");
        const effectiveType = input.category === "simulation" || (existing?.category !== "simulation" && existing?.effectiveType === "tryout") ? "tryout" : "quiz";
        if (!canEditQuiz(role, { category: input.category, effectiveType })) {
          deny("forbidden", "Kuis simulasi hanya dapat diubah oleh admin.");
        }
        const issue = quizValidationError(input, data.bank);
        if (issue) deny("invalid", issue);
        const id = existing?.id ?? newId("quiz");
        replace(data.quizzes, {
          ...input, title: input.title.trim(), id, revision: (existing?.revision ?? 0) + 1,
          courseId: data.course.id, creatorName: existing?.creatorName ?? (role === "tutor" ? "Tutor Biologi" : "Admin Akademik"),
          effectiveType,
        });
        return success(id, input.status === "published" && existing?.status !== "published" ? "Kuis diterbitkan." : "Kuis tersimpan.");
      }
      case "quiz.status":
      case "quiz.delete": {
        const quiz = checked(data.quizzes, command.target, "Kuis");
        if (!canEditQuiz(role, quiz)) deny("forbidden", "Kuis simulasi hanya dapat diubah oleh admin.");
        if (command.kind === "quiz.delete") {
          remove(data.quizzes, quiz);
          data.attempts = data.attempts.filter((attempt) => attempt.templateId !== quiz.id);
          return success(quiz.id, "Kuis dihapus.");
        }
        replace(data.quizzes, { ...quiz, status: command.status, revision: quiz.revision + 1 });
        return success(quiz.id, command.status === "published" ? "Kuis diterbitkan." : "Kuis dipindahkan ke draf.");
      }
      case "bank.save":
      case "bank.delete": {
        const question = command.target ? checked(data.bank, command.target, "Soal") : undefined;
        if (question && question.origin !== "zyx_original") deny("forbidden", "Soal referensi hanya dapat ditinjau.");
        if (command.kind === "bank.delete" && question) {
          remove(data.bank, question);
          return success(question.id, "Soal dihapus dari bank.");
        }
        if (command.kind !== "bank.save") deny("not_found", "Soal tidak ditemukan.");
        const issue = questionValidationError(command.input);
        if (issue) deny("invalid", issue);
        const id = question?.id ?? newId("question");
        replace(data.bank, { ...command.input, id, revision: (question?.revision ?? 0) + 1, origin: "zyx_original" });
        return success(id, "Soal tersimpan di bank.");
      }
      case "tryout.save":
      case "tryout.metadata.save": {
        const prior = command.target ? checked(data.tryouts, command.target, "Tryout") : undefined;
        const { title, timeLimitMinutes, maxAttempts, openAt, closeAt } = command.input;
        if (!title.trim()) deny("invalid", "Judul tryout wajib diisi.");
        if (![timeLimitMinutes, maxAttempts].every((value) => Number.isInteger(value) && value > 0)) deny("invalid", "Durasi dan batas percobaan minimal 1.");
        const issue = dateRangeError(openAt, closeAt);
        if (issue) deny("invalid", issue);
        const id = prior?.id ?? newId("tryout");
        replace(data.tryouts, { ...command.input, title: title.trim(), id, revision: (prior?.revision ?? 0) + 1, questions: prior?.questions ?? [] });
        return success(id, "Tryout tersimpan.");
      }
      case "tryout.delete": {
        const exam = checked(data.tryouts, command.target, "Tryout");
        remove(data.tryouts, exam);
        return success(exam.id, "Tryout dihapus.");
      }
      case "tryout.question.save":
      case "tryout.question.delete": {
        const exam = record(data.tryouts, command.examId, "Tryout");
        const question = command.target ? checked(exam.questions, command.target, "Soal tryout") : undefined;
        if (command.kind === "tryout.question.delete" && question) {
          remove(exam.questions, question);
          exam.revision += 1;
          return success(question.id, "Soal tryout dihapus.");
        }
        if (command.kind !== "tryout.question.save") deny("not_found", "Soal tryout tidak ditemukan.");
        const issue = questionValidationError(command.input);
        if (issue) deny("invalid", issue);
        if (!Number.isInteger(command.input.order) || command.input.order < 1) deny("invalid", "Urutan soal minimal 1.");
        const id = question?.id ?? newId("tryout-question");
        replace(exam.questions, { ...question, ...command.input, id, revision: (question?.revision ?? 0) + 1 });
        exam.revision += 1;
        return success(id, "Soal tryout tersimpan.");
      }
      case "tryout.question.import": {
        const exam = checked(data.tryouts, command.exam, "Tryout");
        const bankIds = [...new Set(command.bankIds)];
        if (!bankIds.length) deny("invalid", "Pilih minimal satu soal dari bank soal.");
        const bankRows = bankIds.map((id) => record(data.bank, id, "Soal bank"));
        const fresh = bankRows.filter((row) => !exam.questions.some((question) => question.bankQuestionId === row.id));
        const order = Math.max(0, ...exam.questions.map((question) => question.order));
        exam.questions.push(...fresh.map((question, index) => ({
          id: newId("tryout-question"), revision: 1, bankQuestionId: question.id, type: question.type,
          prompt: question.prompt, options: question.options, correctIndices: question.correctIndices,
          acceptableAnswers: question.acceptableAnswers, acceptsFile: false, order: order + index + 1,
        })));
        if (fresh.length > 0) exam.revision += 1;
        const skipped = bankRows.length - fresh.length;
        return { id: exam.id, imported: fresh.length, skipped, message: `${fresh.length} soal diimpor, ${skipped} dilewati.` };
      }
      case "grading.save": {
        const attempt = record(data.attempts, command.attemptId, "Percobaan kuis");
        if (attempt.status !== "pending" && attempt.status !== "graded") deny("forbidden", "Percobaan belum dikumpulkan.");
        const { items } = command;
        if (!items.length) deny("invalid", "Isi nilai untuk minimal satu jawaban.");
        if (new Set(items.map((item) => item.questionId)).size !== items.length) deny("invalid", "Nilai setiap jawaban satu kali.");
        const answers = attempt.answers.map((answer) => {
          const item = items.find((value) => value.questionId === answer.questionId);
          if (!item) return answer;
          if (!canGrade(answer.type)) deny("forbidden", "Nilai otomatis soal pilihan tidak dapat diubah.");
          if (answer.revision !== item.expectedRevision) deny("conflict", "Nilai telah berubah. Muat versi terbaru sebelum menyimpan.");
          if (!Number.isFinite(item.score) || item.score < 0 || item.score > 100 || (item.reviewNotes?.length ?? 0) > 2000) {
            deny("invalid", "Nilai harus 0 sampai 100 dan catatan maksimal 2.000 karakter.");
          }
          return { ...answer, reviewScore: item.score, reviewNotes: item.reviewNotes?.trim() ?? "", revision: answer.revision + 1 };
        });
        if (items.some((item) => !answers.some((answer) => answer.questionId === item.questionId))) deny("not_found", "Jawaban tidak ditemukan.");
        const remainingEssays = answers.filter((answer) => answer.type === "essay" && answer.reviewScore === null).length;
        if (command.finalize && remainingEssays) deny("invalid", "Berikan nilai untuk semua jawaban esai.");
        const status = remainingEssays ? "pending" : "graded";
        const score = status === "graded" ? Math.round(answers.reduce((sum, answer) => sum + (answer.reviewScore ?? answer.automaticScore ?? 0), 0) / answers.length) : null;
        replace(data.attempts, { ...attempt, status, score, remainingEssays, answers });
        return {
          id: attempt.id, gradingStatus: status,
          message: status === "graded" ? "Penilaian selesai." : "Draf penilaian tersimpan.",
        };
      }
    }
  }

  return {
    canMutate: true,
    canGrade: true,
    canSaveQuiz: true,
    canSaveTryoutDraft: true,
    takeQuizSaveNotice(context, requestId) {
      try {
        const course = authorize(context);
        const entry = completed.get(mutationKey(context, course.id, requestId));
        const notice = entry?.quizSaveNotice ?? null;
        if (entry) delete entry.quizSaveNotice;
        return notice;
      } catch (error) {
        if (error instanceof FixtureError) return null;
        throw error;
      }
    },
    listQuizzes: (context) => read(context, "quizzes", ({ course, quizzes, bank }) => ({ course, quizzes, bank })),
    previewQuiz: (context, id) => read(context, `preview:${id}`, ({ quizzes, bank }) => {
      const { selection } = record(quizzes, id, "Kuis");
      if (selection.mode === "specific") {
        return selection.questionIds.flatMap((questionId) => bank.filter((question) => question.id === questionId));
      }
      return (Object.keys(selection.difficulty) as Array<keyof typeof selection.difficulty>).flatMap((difficulty) =>
        bank.filter((question) => question.difficulty === difficulty && (!selection.tags.length || selection.tags.some((tag) => question.tags.includes(tag))))
          .slice(0, selection.difficulty[difficulty]));
    }),
    listQuizAttempts: (context, id) => read(context, `attempts:${id}`, ({ quizzes, attempts }) => {
      const quiz = record(quizzes, id, "Kuis");
      return {
        quizTitle: quiz.title,
        attempts: attempts.filter((attempt) => attempt.templateId === id).map((attempt) => ({
          ...toAttemptSummary(attempt),
          questions: attempt.answers.map((answer) => ({
            id: answer.questionId, prompt: answer.prompt, answer: answer.submittedAnswer,
            answerKey: answer.questionId === "academic-question-1" ? "Mitokondria"
              : answer.questionId === "academic-question-3" ? "Mitosis" : undefined,
          })),
        })),
      };
    }),
    pendingGrading: (context) => read(context, "grading", ({ attempts }) => attempts.filter((attempt) => attempt.status === "pending").map(toAttemptSummary), "tutor"),
    loadGradingAttempt: (context, id) => read(context, `grading:${id}`, ({ attempts }) => {
      const attempt = record(attempts, id, "Percobaan kuis");
      if (attempt.status !== "pending" && attempt.status !== "graded") deny("forbidden", "Percobaan belum dikumpulkan.");
      return attempt;
    }, "tutor"),
    listTryouts: (context) => read(context, "tryouts", ({ course, tryouts, bank }) => ({ course, tryouts, bank }), "admin"),
    mutate: (context, requestId, command) => result(() => {
      const role = command.kind.startsWith("tryout.") ? "admin" : command.kind === "grading.save" || command.kind.startsWith("bank.") ? "tutor" : undefined;
      const course = authorize(context, role);
      if (!requestId.trim()) deny("invalid", "Identitas penyimpanan wajib diisi.");
      const key = mutationKey(context, course.id, requestId);
      const fingerprint = JSON.stringify(command);
      const prior = completed.get(key);
      if (prior) {
        if (prior.fingerprint !== fingerprint) deny("conflict", "Identitas penyimpanan sudah dipakai untuk perubahan lain.");
        if (prior.result.ok) return prior.result.value;
      }
      failOnce(context.scenario, key);
      const outcome = mutateRecords(resolveCourse(course, context.scenario), context.scope.kind, clone(command));
      completed.set(key, {
        fingerprint, result: { ok: true, value: clone(outcome) },
        ...(command.kind === "quiz.save" ? { quizSaveNotice: outcome.message } : {}),
      });
      return outcome;
    }),
  };
}
