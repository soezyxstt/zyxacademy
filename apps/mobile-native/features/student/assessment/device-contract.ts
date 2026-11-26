import type { AssessmentKind } from "../../../../../packages/native-parity/student/assessment/contract";

export type AssessmentFile = { uri: string; name: string; type: string; size?: number; release?: () => void };

export type AssessmentAttachmentTarget = {
  route: string;
  kind: AssessmentKind;
  assessmentId: string;
  attemptId?: string;
  questionId: string;
  requestId: string;
  signal: AbortSignal;
  isDraftCurrent: () => boolean;
};

export type AssessmentPhotoPicker = {
  pick(target: AssessmentAttachmentTarget): Promise<AssessmentFile | null>;
  recover(target: AssessmentAttachmentTarget): Promise<AssessmentFile | null>;
  pickDocument?(target: AssessmentAttachmentTarget): Promise<AssessmentFile | null>;
};

export const assessmentAttachmentLimit = (kind: AssessmentKind) => (kind === "quiz" ? 4 : 10) * 1024 * 1024;
