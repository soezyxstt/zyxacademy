import { dateRangeError, type TryoutInput, type TryoutQuestionInput } from "./model";

export type TryoutDraftInput = Omit<TryoutInput, "status">;
export type TryoutDraftWrite = TryoutDraftInput & {
  courseId: string;
  expectedRevision: string | null;
};
export type TryoutDraftReceipt = { requestId: string; examId: string; revision: string };
export const tryoutStatuses = ["draft", "published", "ended"] as const;
export type TryoutMetadataWrite = TryoutDraftWrite & { status: TryoutInput["status"] };
export type TryoutMetadataReceipt = TryoutDraftReceipt & { status: TryoutInput["status"] };
export const maxTryoutBankImport = 100;
export type TryoutQuestionSetWrite = { courseId: string; expectedRevision: string } & (
  | { action: "import"; bankIds: string[] }
  | { action: "remove"; questionId: string }
);
export type TryoutContentWrite = { courseId: string; expectedRevision: string } & (
  | { action: "save-question"; targetId: string | null; input: TryoutQuestionInput }
  | { action: "delete-question"; targetId: string }
  | { action: "delete" }
);
export type TryoutContentReceipt = { requestId: string; examId: string; questionId?: string; revision: string | null };

export type TryoutQuestionSetReceipt = TryoutDraftReceipt & { imported: number; skipped: number };

export function tryoutDraftValidationError(input: TryoutDraftInput): string | undefined {
  if (!input.title.trim() || input.title.trim().length > 255) return "Judul tryout wajib diisi dan maksimal 255 karakter.";
  if (![input.timeLimitMinutes, input.maxAttempts].every((value) => Number.isSafeInteger(value) && value >= 1)) {
    return "Durasi dan batas percobaan harus berupa bilangan bulat minimal 1.";
  }
  return dateRangeError(input.openAt, input.closeAt);
}
