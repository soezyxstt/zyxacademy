import type { useTranslations } from "@/lib/i18n/client";

const labels: Record<string, string> = {
  tutor_slot: "slot",
  booking: "booking",
  reschedule_ticket: "ticket",
  "tutor.slot.create": "slotCreate",
  "tutor.slot.delete": "slotDelete",
  "tutor.slot.copy_previous_week": "slotCopy",
  "tutor.session.move": "sessionMove",
  "tutor.ticket.create": "ticketCreate",
  "tutor.ticket.decide": "ticketDecide",
  "tutor.ticket.message": "ticketMessage",
};

export function activityLabel(value: string, t: ReturnType<typeof useTranslations>): string {
  return labels[value] ? t(`tutorActivityUI.labels.${labels[value]}`) : value;
}
