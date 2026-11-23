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
  // Actions
  "tutor.slot.create": "slotCreate",
  "tutor.slot.delete": "slotDelete",
  "tutor.slot.copy_previous_week": "slotCopy",
  "tutor.session.move": "sessionMove",
  "tutor.ticket.create": "ticketCreate",
  "tutor.ticket.decide": "ticketDecide",
  "tutor.ticket.message": "ticketMessage",
  canonical_create_with_legacy: "created",
  canonical_update_with_legacy: "updated",
  draft_created: "draftCreated",
  dual_write: "assignmentUpdated",
  create: "created",
  update: "updated",
  delete: "deleted",
};

function humanizeFallback(value: string): string {
  const cleaned = value.replace(/[._-]+/g, " ").trim().toLowerCase();
  if (!cleaned) return "-";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function activityLabel(value: string, t: ReturnType<typeof useTranslations>): string {
  const normalized = value.trim().toLowerCase();
  const key = labels[value] ?? labels[normalized];
  return key ? t(`tutorActivityUI.labels.${key}`) : humanizeFallback(value);
}
