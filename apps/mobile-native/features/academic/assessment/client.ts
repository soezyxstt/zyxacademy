import type {
  AssessmentCommand, AssessmentContext, AssessmentErrorCode, AssessmentGateway, AssessmentResult, MutationEffect, OutstandingQuizSave,
} from "../../../../../packages/native-parity/academic/assessment/model";
import { quizAuthoringPayload } from "../../../../../packages/native-parity/academic/assessment/quiz-payload";
import type { TryoutDraftWrite } from "../../../../../packages/native-parity/academic/assessment/tryout-draft";
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

type SaveResult = AssessmentResult<MutationEffect>;
type SaveCommand = OutstandingQuizSave["command"];
type TryoutDraftCommand = Extract<AssessmentCommand, { kind: "tryout.save" }>;
type PendingTryoutDraft = {
  requestId: string;
  fingerprint: string;
  effect?: MutationEffect;
  inFlight?: Promise<SaveResult>;
};

type SaveEntry = OutstandingQuizSave & {
  scope: string;
  fingerprint: string;
  effect?: MutationEffect;
  inFlight?: Promise<SaveResult>;
};
const sessionGateways = new WeakMap<AcademicTransport, AssessmentGateway>();

export function createAssessmentReadGateway(transport: AcademicTransport): AssessmentGateway {
  const existing = sessionGateways.get(transport);
  if (existing) return existing;
  const outstanding = new Map<string, SaveEntry>();
  const tryoutDrafts = new Map<string, PendingTryoutDraft>();
  const scopeKey = (context: AssessmentContext) => JSON.stringify([context.actor.id, context.scope]);
  const quizKey = (context: AssessmentContext, quizId: string | null) => JSON.stringify([scopeKey(context), quizId]);
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

  const uncertain = { ok: false, code: "unavailable", message: "Hasil penyimpanan belum diketahui. Coba lagi." } as const;

  async function saveQuiz(context: AssessmentContext, requestId: string, command: SaveCommand, signal?: AbortSignal): Promise<SaveResult> {
    const { courseId, target, input } = command;
    const send = transport.command?.bind(transport);
    if (!send || !courseId || (context.scope.kind === "tutor" && input.category === "simulation")) return forbidden;
    const key = quizKey(context, target?.id ?? null);
    const anotherScope = [...outstanding.entries()].some(([savedKey, entry]) => savedKey !== key && entry.requestId === requestId);
    if (anotherScope) return { ok: false, code: "conflict", message: "Lanjutkan dari peran dan halaman kuis semula." };
    const fingerprint = JSON.stringify(command);
    const previous = outstanding.get(key);
    if (previous && (previous.requestId !== requestId || previous.fingerprint !== fingerprint)) return uncertain;
    if (previous?.effect) return { ok: true, value: previous.effect };
    if (previous?.inFlight) return previous.inFlight;

    const entry = previous ?? {
      requestId, fingerprint, scope: scopeKey(context),
      command: JSON.parse(fingerprint) as SaveCommand, confirmed: false,
    };
    const fields = quizAuthoringPayload(entry.command.input);
    const path = target ? `/api/quiz/templates/${encodeURIComponent(target.id)}` : "/api/quiz/templates";
    const scope = { actingRole: context.scope.kind };
    const body = target
      ? { ...fields, ...scope, expectedRevision: target.expectedRevision, expectedCourseId: courseId }
      : { ...fields, ...scope, courseId };
    outstanding.set(key, entry);

    const operation: Promise<SaveResult> = (async () => {
      try {
        const response = await send(path, { method: target ? "PATCH" : "POST", requestId, body },
          signal ?? new AbortController().signal);
        if (!response.ok) {
          if (response.status >= 500 || response.status === 429) return uncertain;
          outstanding.delete(key);
          if (response.status === 409) {
            const body = await response.json().catch(() => null);
            if (body && typeof body === "object" && "error" in body && body.error === "QUIZ_TAG_CONFLICT") {
              return { ok: false, code: "invalid", message: "Tag bab ini sudah dipakai kuis lain." };
            }
          }
          const error = responseError(response.status);
          return { ...error, message: error.code === "invalid" ? "Periksa pengaturan dan pilihan soal kuis."
            : error.code === "conflict" ? "Kuis atau tag bab telah berubah. Muat versi terbaru." : error.message };
        }
        const data = await response.json();
        if (!data || typeof data !== "object") return uncertain;
        const receipt = data as Record<string, unknown>;
        if (receipt.requestId !== requestId || receipt.actingRole !== context.scope.kind || typeof receipt.templateId !== "string" ||
          (target && receipt.templateId !== target.id)) return uncertain;
        const message = input.status === "published" && !target ? "Kuis diterbitkan." : "Kuis tersimpan.";
        entry.effect = { id: receipt.templateId, message };
        entry.confirmed = true;
        return { ok: true, value: entry.effect };
      } catch {
        return uncertain;
      }
    })();
    entry.inFlight = operation;
    try {
      return await operation;
    } finally {
      entry.inFlight = undefined;
    }
  }

  async function saveTryoutDraft(context: AssessmentContext, requestId: string, command: TryoutDraftCommand, signal?: AbortSignal): Promise<SaveResult> {
    const { courseId, target, input } = command;
    const send = transport.command?.bind(transport);
    if (!send || context.scope.kind !== "admin" || !courseId || input.status !== "draft" ||
      (target && !target.metadataRevision)) return forbidden;

    const key = scopeKey(context);
    const previous = tryoutDrafts.get(key);
    const fingerprint = JSON.stringify(command);
    if (previous && (previous.requestId !== requestId || previous.fingerprint !== fingerprint)) return uncertain;
    if (previous?.effect) return { ok: true, value: previous.effect };
    if (previous?.inFlight) return previous.inFlight;

    const entry: PendingTryoutDraft = previous ?? { requestId, fingerprint };
    const body: TryoutDraftWrite = {
      courseId, expectedRevision: target?.metadataRevision ?? null,
      title: input.title, timeLimitMinutes: input.timeLimitMinutes, maxAttempts: input.maxAttempts,
      openAt: input.openAt, closeAt: input.closeAt,
    };
    const path = endpoint(context, target ? `tryouts/${encodeURIComponent(target.id)}` : "tryouts");
    tryoutDrafts.set(key, entry);
    const operation: Promise<SaveResult> = (async () => {
      try {
        const response = await send(path, { method: target ? "PATCH" : "POST", requestId, body },
          signal ?? new AbortController().signal);
        if (!response.ok) {
          if (response.status >= 500 || response.status === 429) return uncertain;
          tryoutDrafts.delete(key);
          const error = responseError(response.status);
          if (error.code === "invalid") return { ...error, message: "Periksa judul, durasi, batas percobaan, dan jadwal tryout." };
          if (error.code === "conflict") return { ...error, message: "Draf tryout atau kursus telah berubah. Muat versi terbaru." };
          return error;
        }
        const data = await response.json();
        if (!data || typeof data !== "object") return uncertain;
        const receipt = data as Record<string, unknown>;
        if (receipt.requestId !== requestId || typeof receipt.examId !== "string" || typeof receipt.revision !== "string" ||
          !/^[a-f0-9]{64}$/.test(receipt.revision) || (target && receipt.examId !== target.id)) return uncertain;
        entry.effect = { id: receipt.examId, message: "Draf tryout tersimpan." };
        return { ok: true, value: entry.effect };
      } catch {
        return uncertain;
      }
    })();
    entry.inFlight = operation;
    try {
      return await operation;
    } finally {
      entry.inFlight = undefined;
    }
  }

  const gateway: AssessmentGateway = {
    canMutate: false,
    canGrade: Boolean(transport.command),
    canSaveQuiz: Boolean(transport.command),
    canSaveTryoutDraft: Boolean(transport.command),
    pendingTryoutDraft(context) {
      if (!accountMatches(context)) return null;
      const entry = tryoutDrafts.get(scopeKey(context));
      return entry ? { requestId: entry.requestId, command: JSON.parse(entry.fingerprint) as TryoutDraftCommand, confirmed: Boolean(entry.effect) } : null;
    },
    confirmTryoutDraft(context, requestId) {
      if (!accountMatches(context)) return;
      const key = scopeKey(context);
      const entry = tryoutDrafts.get(key);
      if (entry?.requestId === requestId && entry.effect) tryoutDrafts.delete(key);
    },
    takeQuizSaveNotice(context, requestId) {
      if (!accountMatches(context)) return null;
      for (const [key, entry] of outstanding) {
        if (entry.scope !== scopeKey(context) || entry.requestId !== requestId || !entry.effect) continue;
        outstanding.delete(key);
        return entry.effect.message;
      }
      return null;
    },
    pendingQuizSave(context, quizId) {
      if (!accountMatches(context)) return null;
      const entry = outstanding.get(quizKey(context, quizId));
      return entry ? {
        requestId: entry.requestId, confirmed: entry.confirmed,
        command: JSON.parse(entry.fingerprint) as SaveCommand,
      } : null;
    },
    listQuizzes: (context, signal) => read(context, "quizzes", signal),
    previewQuiz: (context, id, signal) => read(context, `preview/${encodeURIComponent(id)}`, signal),
    listQuizAttempts: (context, id, signal) => read(context, `attempts/${encodeURIComponent(id)}`, signal),
    pendingGrading: (context, signal) => read(context, "grading", signal),
    loadGradingAttempt: (context, id, signal) => read(context, `grading/${encodeURIComponent(id)}`, signal),
    listTryouts: (context, signal) => read(context, "tryouts", signal),
    async mutate(context, requestId, command, signal) {
      if (!accountMatches(context) || !transport.command) return forbidden;
      if (command.kind === "quiz.save") return saveQuiz(context, requestId, command, signal);
      if (command.kind === "tryout.save") return saveTryoutDraft(context, requestId, command, signal);
      if (command.kind === "quiz.status" || command.kind === "quiz.delete") {
        const { target, courseId } = command;
        const isDelete = command.kind === "quiz.delete";
        if (!courseId) return forbidden;
        try {
          const response = await transport.command(`/api/quiz/templates/${encodeURIComponent(target.id)}`, {
            method: isDelete ? "DELETE" : "PATCH", requestId,
            body: {
              actingRole: context.scope.kind, expectedRevision: target.expectedRevision, expectedCourseId: courseId,
              ...(!isDelete ? { status: command.status } : {}),
            },
          }, signal ?? new AbortController().signal);
          if (!response.ok) {
            if (response.status >= 500 || response.status === 429) return uncertain;
            const error = responseError(response.status);
            return { ...error, message: error.code === "conflict" ? "Kuis telah berubah. Muat versi terbaru." : error.message };
          }
          const data = await response.json();
          if (!data || typeof data !== "object") return uncertain;
          const receipt = data as Record<string, unknown>;
          if (receipt.requestId !== requestId || receipt.actingRole !== context.scope.kind || receipt.templateId !== target.id) return uncertain;
          return { ok: true, value: { id: target.id, message: isDelete ? "Kuis dihapus." : command.status === "published" ? "Kuis diterbitkan." : "Kuis dipindahkan ke draf." } };
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
  sessionGateways.set(transport, gateway);
  return gateway;
}
