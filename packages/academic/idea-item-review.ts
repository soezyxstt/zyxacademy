export const ideaReviewStatuses = { pending: "Menunggu review", approved: "Disetujui", changes_requested: "Perlu revisi" } as const;
export type IdeaReviewStatus = keyof typeof ideaReviewStatuses;
export const ideaReviewNoteLimit = 2000;
export const canEditIdeaReview = (status: string) => ["validated", "approved", "rejected"].includes(status);
export type IdeaReviewDraft = {
  expectedRevision: string;
  expectedReviewRevision: string;
  status: IdeaReviewStatus;
  notes: string;
};
export type IdeaReviewTarget = {
  courseId: string; importId: string; ideaId: string; code: string;
  statement: string; explanation: string; editable: boolean;
  latex: string | null;
  sources: { title: string; excerpt: string; locator: string | null }[];
  review: IdeaReviewDraft;
};

export function isIdeaReviewTarget(value: unknown): value is IdeaReviewTarget {
  if (!value || typeof value !== "object") return false;
  const target = value as Partial<IdeaReviewTarget>;
  const review = target.review;
  return [target.courseId, target.importId, target.ideaId, target.code, target.statement, target.explanation].every((text) => typeof text === "string")
    && typeof target.editable === "boolean" && !!review
    && (target.latex === null || typeof target.latex === "string")
    && Array.isArray(target.sources) && target.sources.every((source) => source && typeof source.title === "string"
      && typeof source.excerpt === "string" && (source.locator === null || typeof source.locator === "string"))
    && /^[a-f0-9]{64}$/.test(review.expectedRevision) && /^[a-f0-9]{64}$/.test(review.expectedReviewRevision)
    && Object.hasOwn(ideaReviewStatuses, review.status) && typeof review.notes === "string" && review.notes.length <= ideaReviewNoteLimit;
}
