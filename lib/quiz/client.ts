import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requestJson, ApiError } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";
import { type QuizSubmission } from "@/lib/quiz/player-state";

const questionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(z.string()),
  correct_indices: z.array(z.number().int()).optional(),
  correctIndices: z.array(z.number().int()).optional(),
  acceptable_answers: z.array(z.string()).optional(),
  acceptableAnswers: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  type: z.string().optional(),
  question_type: z.string().optional(),
  questionType: z.string().optional(),
  origin: z.enum(["zyx_original", "historical_reference", "itb_example"]).optional(),
  sourceEventName: z.string().nullable().optional(),
  sourceReferenceId: z.string().nullable().optional(),
});

export const quizAttemptSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  templateId: z.string(),
  score: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  status: z.string(),
  gradingStatus: z.enum(["not_required", "pending", "graded"]).optional(),
  questionsSnapshot: z.array(questionSchema),
  // The server also includes its private attachment registry in this record.
  // Each rendered answer is narrowed by question type; that registry is never submitted.
  answersSnapshot: z.record(z.string(), z.unknown()).nullable().transform((value) => value ?? {}),
  submittedAt: z.string().nullable(),
  strongAreas: z.array(z.string()).nullable(),
  weakAreas: z.array(z.string()).nullable(),
  recommendedNextSteps: z.array(z.object({
    id: z.string(), kind: z.enum(["flashcards", "quiz", "module"]),
    title: z.string(), count: z.number().optional(), href: z.string(),
  })).nullable(),
  feedback: z.array(z.object({
    questionIndex: z.number().int().nonnegative(),
    payload: z.object({
      whyWrong: z.string(), misconceptionName: z.string().nullable().optional(),
      correctApproach: z.array(z.string()), reviewHref: z.string(),
    }),
  })),
  remediation: z.object({
    concepts: z.array(z.object({ conceptName: z.string(), before: z.number(), after: z.number(), delta: z.number() })),
    rootCauses: z.array(z.object({
      conceptName: z.string(), mastery: z.number(),
      blockedBy: z.array(z.object({ conceptName: z.string(), mastery: z.number() })),
    })),
    misconceptions: z.array(z.object({ misconceptionName: z.string(), whyWrong: z.string(), reviewHref: z.string() })),
    estimatedMinutes: z.number(),
  }).nullable().optional(),
});

export type QuizAttempt = z.infer<typeof quizAttemptSchema>;
export type ReviewQuestion = z.infer<typeof questionSchema>;

export async function fetchQuizAttempt(userId: string, attemptId: string, signal?: AbortSignal): Promise<QuizAttempt> {
  const data = await requestJson(`/api/quiz/attempts/${encodeURIComponent(attemptId)}`, quizAttemptSchema, { signal });
  // Reject a late response from a changed browser session before it enters this user's cache.
  if (data.id !== attemptId || data.studentId !== userId) throw new ApiError(409, "Quiz attempt identity changed");
  return data;
}

export function quizAttemptQuery(userId: string, attemptId: string) {
  return queryOptions({
    queryKey: queryKeys.quizzes.attempt(userId, attemptId),
    queryFn: ({ signal }) => fetchQuizAttempt(userId, attemptId, signal),
    staleTime: 30_000,
    // Review reads record disclosures; polling owns their retry cadence.
    retry: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
  });
}

export const quizSubmissionResultSchema = z.object({
  score: z.number().nullable(),
  correct: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  gradingStatus: z.enum(["not_required", "pending", "graded"]),
});

export function submitQuizAttempt(attemptId: string, payload: QuizSubmission) {
  return requestJson(`/api/quiz/attempts/${encodeURIComponent(attemptId)}`, quizSubmissionResultSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export const quizAttachmentSchema = z.object({
  success: z.literal(true),
  key: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.string(),
});
export type QuizAttachment = z.infer<typeof quizAttachmentSchema>;

export function removeQuizAttachment(attemptId: string, fileKey: string) {
  return requestJson("/api/quiz/attachments", z.object({ success: z.literal(true) }), {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attemptId, fileKey }),
  });
}

/** XHR supplies byte-level upload progress; Query does not replace that transport. */
export function uploadQuizAttachment({ attemptId, file, signal, onProgress }: {
  attemptId: string;
  file: File;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
}): Promise<QuizAttachment> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Upload aborted", "AbortError")); return; }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (callback: () => void) => {
      signal.removeEventListener("abort", abort);
      callback();
    };
    xhr.open("POST", "/api/quiz/attachments");
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && !signal.aborted) onProgress(Math.round(event.loaded / event.total * 100));
    });
    xhr.addEventListener("load", () => finish(() => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError(xhr.status, "Quiz attachment upload failed"));
        return;
      }
      try { resolve(quizAttachmentSchema.parse(JSON.parse(xhr.responseText))); }
      catch (error) { reject(error); }
    }));
    xhr.addEventListener("error", () => finish(() => reject(new TypeError("Quiz attachment upload failed"))));
    xhr.addEventListener("abort", () => finish(() => reject(new DOMException("Upload aborted", "AbortError"))));
    signal.addEventListener("abort", abort, { once: true });
    const body = new FormData();
    body.append("file", file);
    body.append("attemptId", attemptId);
    try { xhr.send(body); } catch (error) { finish(() => reject(error)); }
  });
}
