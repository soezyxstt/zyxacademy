import type { useTranslations } from "@/lib/i18n/client";

const labels: Record<string, string> = {
  // Entities
  tutor_slot: "slot",
  booking: "booking",
  reschedule_ticket: "ticket",
  bab: "chapter",
  mata_kuliah: "course",
  product_bundle: "productBundle",
  tutor_assignment: "tutorAssignment",
  quiz: "quiz",
  quiz_template: "quiz",
  tryout: "tryout",
  material: "material",
  document: "material",
  coding_problem: "codingProblem",
  idea_bundle: "ideaBundle",
  source_document: "sourceDocument",
  source_material: "sourceMaterial",
  source_pack: "sourcePack",
  artikel: "article",
  article: "article",
  diktat_materi: "diktat",
  diktat: "diktat",
  soal: "question",
  question: "question",
  pembahasan_soal: "questionExplanation",
  flashcard: "flashcard",
  live_session: "liveSession",
  idea: "idea",
  dependency: "dependency",
  product_diktat_pdf_attempt: "diktatPdfAttempt",
  // Actions
  "tutor.slot.create": "slotCreate",
  "tutor.slot.delete": "slotDelete",
  "tutor.slot.copy_previous_week": "slotCopy",
  "tutor.session.move": "sessionMove",
  "tutor.ticket.create": "ticketCreate",
  "tutor.ticket.decide": "ticketDecide",
  "tutor.ticket.message": "ticketMessage",
  "material:create": "materialCreate",
  "material:update": "materialUpdate",
  "material:delete": "materialDelete",
  "quiz:create": "quizCreate",
  "quiz:update": "quizUpdate",
  "quiz:delete": "quizDelete",
  "admin.tutor_slot.create_override": "slotCreateOverride",
  "admin.tutor_slot.delete_override": "slotDeleteOverride",
  "admin.tutorial_session.assign_override": "sessionAssignOverride",
  "admin.tutorial_session.move_override": "sessionMoveOverride",
  "admin.tutorial_session.cancel_override": "sessionCancelOverride",
  canonical_create_with_legacy: "created",
  canonical_update_with_legacy: "updated",
  draft_created: "draftCreated",
  draft_replaced: "draftReplaced",
  draft_discarded: "draftDiscarded",
  revision_reviewed: "revisionReviewed",
  reviewed: "reviewed",
  rejected: "rejected",
  resolved: "resolved",
  registered: "registered",
  queued: "queued",
  published: "published",
  archived: "archived",
  dual_write: "assignmentUpdated",
  create: "created",
  update: "updated",
  delete: "deleted",
};

const GENERIC_ACTION_SUMMARY_KEY: Record<string, string> = {
  create: "createdEntity",
  canonical_create_with_legacy: "createdEntity",
  update: "updatedEntity",
  canonical_update_with_legacy: "updatedEntity",
  delete: "deletedEntity",
  draft_created: "draftCreatedEntity",
  draft_replaced: "draftReplacedEntity",
  draft_discarded: "draftDiscardedEntity",
  published: "publishedEntity",
  archived: "archivedEntity",
};

function humanizeFallback(value: string): string {
  const cleaned = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!cleaned) return "-";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function activityLabel(value: string, t: ReturnType<typeof useTranslations>): string {
  const normalized = value.trim().toLowerCase();
  const key = labels[value] ?? labels[normalized];
  return key ? t(`tutorActivityUI.labels.${key}`) : humanizeFallback(value);
}

export function activitySummaryTitle(
  action: string,
  entityType: string,
  t: ReturnType<typeof useTranslations>,
): string {
  const normalizedAction = action.trim().toLowerCase();
  const summaryKey = GENERIC_ACTION_SUMMARY_KEY[normalizedAction];
  if (summaryKey) {
    const entity = activityLabel(entityType, t).toLowerCase();
    return t(`tutorActivityUI.summary.${summaryKey}`, { entity });
  }
  return activityLabel(action, t);
}
