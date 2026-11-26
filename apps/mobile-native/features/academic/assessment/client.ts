import type {
  AssessmentContext, AssessmentErrorCode, AssessmentGateway, AssessmentResult,
} from "../../../../../packages/native-parity/academic/assessment/model";
import type { AcademicTransport } from "../client";

export function createAssessmentReadGateway(transport: AcademicTransport): AssessmentGateway {
  async function read<T>(context: AssessmentContext, resource: string, signal?: AbortSignal): Promise<AssessmentResult<T>> {
    if (transport.accountId !== context.actor.id || context.actor.role !== context.scope.kind) {
      return { ok: false, code: "forbidden", message: "Akun ini tidak memiliki akses ke halaman penilaian." };
    }
    const key = context.scope.kind === "tutor" ? context.scope.courseId : context.scope.slug;
    const path = `/api/native/academic-assessment/${context.scope.kind}/${encodeURIComponent(key)}/${resource}`;
    try {
      const response = await transport.get(path, signal ?? new AbortController().signal);
      if (response.ok) return { ok: true, value: await response.json() as T };
      const error: { code: AssessmentErrorCode; message: string } = response.status === 401 || response.status === 403
        ? { code: "forbidden", message: "Akun ini tidak memiliki akses ke data penilaian kursus." }
        : response.status === 404 ? { code: "not_found", message: "Data penilaian tidak ditemukan di kursus ini." }
          : { code: "unavailable", message: "Layanan penilaian sementara tidak dapat diakses. Coba lagi." };
      return { ok: false, ...error };
    } catch {
      return { ok: false, code: "unavailable", message: "Data penilaian gagal dimuat." };
    }
  }

  return {
    canMutate: false,
    listQuizzes: (context, signal) => read(context, "quizzes", signal),
    previewQuiz: (context, id, signal) => read(context, `preview/${encodeURIComponent(id)}`, signal),
    listQuizAttempts: (context, id, signal) => read(context, `attempts/${encodeURIComponent(id)}`, signal),
    pendingGrading: (context, signal) => read(context, "grading", signal),
    loadGradingAttempt: (context, id, signal) => read(context, `grading/${encodeURIComponent(id)}`, signal),
    listTryouts: (context, signal) => read(context, "tryouts", signal),
    mutate: async () => ({ ok: false, code: "forbidden", message: "Perubahan penilaian tersedia di web." }),
  };
}
