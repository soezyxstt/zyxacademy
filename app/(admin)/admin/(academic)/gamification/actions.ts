'use server';
import { revalidatePath } from 'next/cache';
import { assertAdmin } from '@/lib/auth/admin-guards-server';
import { approveGamificationChecklist, createOrRefreshGamificationChecklist } from '@/lib/gamification/checklists';
import { closeGamificationReport } from '@/lib/gamification/admin';

export async function gamificationAdminAction(kind: 'refresh' | 'approve' | 'resolved' | 'dismissed', id: string): Promise<{ error?: string }> {
 try {
  const { user } = await assertAdmin();
  if (typeof id !== 'string' || !id || id.length > 200) throw new Error('INVALID_INPUT');
  if (kind === 'refresh') await createOrRefreshGamificationChecklist(user.id, id);
  else if (kind === 'approve') await approveGamificationChecklist(user.id, id);
  else if (kind === 'resolved' || kind === 'dismissed') await closeGamificationReport(user.id, id, kind);
  else throw new Error('INVALID_INPUT');
  revalidatePath('/admin/gamification');
  return {};
 } catch (error) {
  const messages: Record<string, string> = { EMPTY_CHECKLIST_CATEGORY: 'Setiap kategori memerlukan materi terbit yang memenuhi syarat. Periksa artikel, pembahasan, soal, dan flashcard, lalu perbarui draf.', CHECKLIST_STALE: 'Materi telah berubah. Perbarui draf sebelum menyetujui.', CHECKLIST_NOT_DRAFT: 'Checklist sudah bukan draf. Muat ulang halaman.', CHECKLIST_NOT_FOUND: 'Checklist tidak ditemukan. Muat ulang halaman.', COURSE_UNAVAILABLE_OR_AMBIGUOUS: 'Mata kuliah tidak tersedia atau pemetaannya bermasalah. Periksa pengaturan mata kuliah.', REPORT_NOT_PENDING: 'Laporan sudah diproses. Muat ulang halaman.' };
  return { error: messages[error instanceof Error ? error.message : ''] ?? 'Permintaan gagal. Periksa akses dan coba lagi.' };
 }
}
