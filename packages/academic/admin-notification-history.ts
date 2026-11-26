import type { NotificationType } from "../../lib/notifications/types";

const typeLabels: Record<NotificationType, string> = {
  quiz_published: "Kuis",
  quiz_graded: "Nilai kuis",
  flashcard_reminder: "Kartu belajar",
  tutor_reminder: "Pengingat tutor",
  tutor_booking: "Pemesanan tutor",
  tutor_digest: "Ringkasan tutor",
  payment_success: "Pembayaran",
  weekly_progress: "Progres mingguan",
  study_reengagement: "Pengingat belajar",
  admin_broadcast: "Pesan admin",
  admin_alert: "Peringatan admin",
  announcement: "Pengumuman",
  discussion: "Diskusi",
};

export const adminNotificationField = {
  type: "Tipe",
  read: "Status baca",
  delivery: "Pengiriman",
} as const;

export function adminNotificationHistoryFields(entry: {
  type: string; read: boolean; attempted: number; succeeded: number; failedCount: number;
}) {
  let delivery = "Gagal";
  if (entry.attempted === 0) delivery = "Tanpa perangkat";
  else if (entry.succeeded > 0) delivery = entry.failedCount > 0 ? "Terkirim sebagian" : "Terkirim";
  return {
    type: Object.hasOwn(typeLabels, entry.type) ? typeLabels[entry.type as NotificationType] : "Lainnya",
    read: entry.read ? "Sudah dibaca" : "Belum dibaca",
    delivery,
  };
}
