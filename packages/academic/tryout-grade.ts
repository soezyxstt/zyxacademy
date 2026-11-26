export const tryoutGradeRevisionPattern = /^[a-f0-9]{64}$/;
export const tryoutGradeNotesLimit = 4000;

export type TryoutGradeCommand = { score: number; notes: string; expectedRevision: string };
export type TryoutGradeReceipt = { requestId: string; submissionId: string; reviewRevision: string };

export type TryoutGradeDraft = { score: string; notes: string; expectedRevision: string };
export type TryoutGradeResult = { status: "saved"; receipt: TryoutGradeReceipt } |
  { status: "conflict" | "denied" | "invalid" | "unknown" };

export type TryoutGradeEditor = {
  draft(course: string, submission: string): TryoutGradeDraft | undefined;
  changeDraft(course: string, submission: string, value?: TryoutGradeDraft): void;
  pending(course: string, submission: string): TryoutGradeCommand | undefined;
  publish(course: string, submission: string, value: TryoutGradeCommand, requestId: string, signal: AbortSignal): Promise<TryoutGradeResult>;
};
