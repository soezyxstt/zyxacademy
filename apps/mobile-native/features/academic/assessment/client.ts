import type {
  AssessmentContext, AssessmentErrorCode, AssessmentGateway, AssessmentResult,
} from "../../../../../packages/native-parity/academic/assessment/model";
import { quizAuthoringPayload } from "../../../../../packages/native-parity/academic/assessment/quiz-payload";
import type { AcademicTransport } from "../client";

const forbidden = { ok: false, code: "forbidden", message: "Akun ini tidak memiliki akses ke data penilaian kursus." } as const;
const unavailable = { ok: false, code: "unavailable", message: "Layanan penilaian sementara tidak dapat diakses. Coba lagi." } as const;

function endpoint(context: AssessmentContext, resource: string) {
  const key = context.scope.kind === "tutor" ? context.scope.courseId : context.scope.slug;
  return `/api/native/academic-assessment/${context.scope.kind}/${encodeURIComponent(key)}/${resource}`;
}

function responseError(status: number): { ok: false; code: AssessmentErrorCode; message: string } {
  switch (status) {
    case 400:
    case 413:
    case 415:
    case 422: return { ok: false, code: "invalid", message: "Periksa kembali nilai, catatan, dan jawaban yang masih perlu dinilai." };
    case 401:
    case 403: return forbidden;
    case 404: return { ok: false, code: "not_found", message: "Data penilaian tidak ditemukan di kursus ini." };
    case 409: return { ok: false, code: "conflict", message: "Penilaian telah berubah. Muat versi terbaru sebelum menyimpan." };
    default: return unavailable;
  }
}

export function createAssessmentReadGateway(transport: AcademicTransport): AssessmentGateway {
  const notices = new Map<string, string>();
  const noticeId = (context: AssessmentContext, requestId: string) => JSON.stringify([context.actor.id, context.scope, requestId]);
  function accountMatches(context: AssessmentContext) {
    return transport.accountId === context.actor.id && context.actor.role === context.scope.kind;
  }

  async function read<T>(context: AssessmentContext, resource: string, signal?: AbortSignal): Promise<AssessmentResult<T>> {
    if (!accountMatches(context)) return forbidden;
    try {
      const response = await transport.get(endpoint(context, resource), signal ?? new AbortController().signal);
      if (response.ok) return { ok: true, value: await response.json() as T };
      return responseError(response.status);
    } catch {
      return unavailable;
    }
  }

  return {
    canMutate: false,
    canGrade: Boolean(transport.command),
    canSaveQuiz: Boolean(transport.command),
    takeQuizSaveNotice(context, requestId) {
      if (!accountMatches(context)) return null;
      const id = noticeId(context, requestId);
      const notice = notices.get(id);
      notices.delete(id);
      return notice ?? null;
    },
    listQuizzes: (context, signal) => read(context, "quizzes", signal),
    previewQuiz: (context, id, signal) => read(context, `preview/${encodeURIComponent(id)}`, signal),
    listQuizAttempts: (context, id, signal) => read(context, `attempts/${encodeURIComponent(id)}`, signal),
    pendingGrading: (context, signal) => read(context, "grading", signal),
    loadGradingAttempt: (context, id, signal) => read(context, `grading/${encodeURIComponent(id)}`, signal),
    listTryouts: (context, signal) => read(context, "tryouts", signal),
    async mutate(context, requestId, command, signal) {
      if (!accountMatches(context) || !transport.command) return forbidden;
      const uncertain = { ok: false, code: "unavailable", message: "Hasil penyimpanan belum diketahui. Coba lagi." } as const;
      if (command.kind === "quiz.save") {
        const { courseId, target, input } = command;
        if (!courseId || (context.scope.kind === "tutor" && input.category === "simulation")) return forbidden;
        try {
          const fields = quizAuthoringPayload(input);
          const path = target ? `/api/quiz/templates/${encodeURIComponent(target.id)}` : "/api/quiz/templates";
          const body = target
            ? { ...fields, expectedRevision: target.expectedRevision, expectedCourseId: courseId }
            : { ...fields, courseId };
          const response = await transport.command(path, { method: target ? "PATCH" : "POST", requestId, body },
            signal ?? new AbortController().signal);
          if (!response.ok) {
            if (response.status >= 500) return uncertain;
            const error = responseError(response.status);
            return { ...error, message: error.code === "invalid" ? "Periksa pengaturan dan pilihan soal kuis."
              : error.code === "conflict" ? "Kuis atau tag bab telah berubah. Muat versi terbaru." : error.message };
          }
          const data = await response.json();
          if (!data || typeof data !== "object") return uncertain;
          const receipt = data as Record<string, unknown>;
          if (receipt.requestId !== requestId || typeof receipt.templateId !== "string" ||
            (target && receipt.templateId !== target.id)) return uncertain;
          const message = input.status === "published" && !target ? "Kuis diterbitkan." : "Kuis tersimpan.";
          notices.set(noticeId(context, requestId), message);
          return { ok: true, value: { id: receipt.templateId, message } };
        } catch {
          return uncertain;
        }
      }
      if (context.scope.kind !== "tutor" || command.kind !== "grading.save") return forbidden;
      const { attemptId, items, finalize } = command;
      try {
        const response = await transport.command(endpoint(context, `grading/${encodeURIComponent(attemptId)}`), {
          method: "POST", requestId, body: { items, finalize },
        }, signal ?? new AbortController().signal);
        if (!response.ok) return response.status >= 500 ? uncertain : responseError(response.status);
        const data = await response.json();
        if (!data || typeof data !== "object") return uncertain;
        const receipt = data as Record<string, unknown>;
        const { gradingStatus } = receipt;
        if (receipt.requestId !== requestId || receipt.attemptId !== attemptId || (gradingStatus !== "pending" && gradingStatus !== "graded")) {
          return uncertain;
        }
        return { ok: true, value: {
          id: attemptId, gradingStatus,
          message: gradingStatus === "graded" ? "Penilaian selesai." : "Draf penilaian tersimpan.",
        } };
      } catch {
        return uncertain;
      }
    },
  };
}
