import { dateRangeError, type TryoutInput } from "./model";

export type TryoutDraftInput = Omit<TryoutInput, "status">;
export type TryoutDraftWrite = TryoutDraftInput & {
  courseId: string;
  expectedRevision: string | null;
};
export type TryoutDraftReceipt = { requestId: string; examId: string; revision: string };

export function tryoutDraftValidationError(input: TryoutDraftInput): string | undefined {
  if (!input.title.trim() || input.title.trim().length > 255) return "Judul tryout wajib diisi dan maksimal 255 karakter.";
  if (![input.timeLimitMinutes, input.maxAttempts].every((value) => Number.isSafeInteger(value) && value >= 1)) {
    return "Durasi dan batas percobaan harus berupa bilangan bulat minimal 1.";
  }
  return dateRangeError(input.openAt, input.closeAt);
}
