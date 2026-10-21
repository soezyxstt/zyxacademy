export const ZYX_ACTIVITY_UPDATED_EVENT = "zyx:activity-updated";

export type ActivityDetail = {
  type: "quiz" | "flashcard" | "material" | "article";
  courseId?: string;
  materialId?: string;
  attemptId?: string;
  cardId?: string;
  sectionId?: string;
};

/**
 * Emits a client-side activity mutation event to notify the student shell
 * (and any active caches) that learning progress has successfully occurred.
 */
export function emitActivityUpdated(detail?: ActivityDetail): void {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(ZYX_ACTIVITY_UPDATED_EVENT, { detail }));
  }
}
