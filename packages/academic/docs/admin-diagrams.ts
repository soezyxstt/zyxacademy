import { getTutorDocDiagram, type TutorDocDiagram } from "./tutor/diagrams";
import type { DocDiagramId, DocLocale } from "./types";

export function getAdminDocDiagram(id: DocDiagramId, locale: DocLocale): TutorDocDiagram | null {
  const en = locale === "en";
  const t = (indonesian: string, english: string) => en ? english : indonesian;
  const row = (title: string, note: string) => ({ title, note });
  switch (id) {
    case "course-hierarchy": return {
      caption: t("Hierarki mata kuliah: satu ID stabil menampung urutan bab silabus dan seluruh materi terkait.",
        "Course hierarchy: one stable ID anchors ordered syllabus chapters and all linked learning assets."),
      rows: [
        row("Kalkulus IA", "ma1101 · /admin/courses/ma1101"),
        row(t("Bab 1: Limit & Kekontinuan", "Chapter 1: Limits & Continuity"), t("Urutan 1", "Order 1")),
        row(t("Materi bab", "Chapter assets"), t("Dokumen PDF, playlist video, kuis bab, Idea & Diktat", "PDF documents, video playlists, chapter quizzes, Ideas & Diktat")),
      ],
    };
    case "filename-anatomy": return {
      caption: t("Pisahkan segmen dengan garis bawah (_) dan kata dalam segmen dengan tanda hubung (-). Hilangkan segmen bab untuk UTS, UAS, atau UP.",
        "Separate segments with underscores (_) and words inside a segment with hyphens (-). Omit the chapter segment for UTS, UAS, or UP."),
      rows: [
        row("ma1101", t("Kode MK", "Course ID")), row("bab01", t("Bab (2 digit)", "Chapter (2 digits)")),
        row("materi", t("Kategori", "Category")), row("limit-kontinu", t("Deskripsi topik", "Topic slug")),
        row("slide", t("Peran (opsional)", "Role (optional)")), row("2025-sem1.pdf", t("Tahun dan semester", "Year and term")),
      ],
    };
    case "upload-duplicate-flow": return {
      caption: t("Tinjau metadata yang terbaca otomatis dan peringatan checksum sebelum menyimpan.",
        "Review auto-parsed metadata and checksum alerts before saving."),
      rows: [
        row(t("1. Antrekan PDF", "1. Queue PDFs"), t("Hingga 200 berkas, 50 MiB per berkas", "Up to 200 files, 50 MiB each")),
        row(t("2. Cek checksum", "2. Checksum scan"), t("Deteksi duplikat dalam mata kuliah", "Detect exact matches in the course")),
        row(t("3. Pilih aksi dan unggah", "3. Resolve and upload"), t("Lewati, Simpan keduanya, atau Timpa", "Skip, Keep both, or Overwrite")),
      ],
    };
    case "mcp-authoring-pipeline": return {
      caption: t("Setiap tahap membutuhkan hasil valid dari tahap sebelumnya. Publikasi dilakukan di Zyx Admin.",
        "Each stage requires validated output from the previous stage. Publishing happens in Zyx Admin."),
      rows: [
        row("Source Pack", t("Transkripsi PDF yang setia pada sumber", "Faithful PDF transcription")),
        row("Idea Bundle", t("Peta konsep terlacak, diterbitkan oleh Admin", "Traceable concept map, published by Admin")),
        row("Product Bundle", t("Verifikasi dan terbitkan Artikel & Diktat A4 (V4)", "Verify and publish the Article & A4 Diktat (V4)")),
      ],
    };
    case "assessment-workflows": return {
      caption: t("Soal original masuk ke draf untuk ditinjau. Referensi historis langsung terbit dan permanen.",
        "Original questions land in draft for review. Historical references publish immediately and are immutable."),
      rows: [
        row(t("Soal original Zyx", "Original Zyx questions"), t("quiz_bank · Validasi, simpan draf, tinjau dan terbitkan di Zyx Admin",
          "quiz_bank · Validate, save as draft, review and publish in Zyx Admin")),
        row(t("Referensi historis", "Historical reference"), t("reference_question_ingest · Validasi teks PDF utuh lalu kirim untuk menerbitkan",
          "reference_question_ingest · Validate the verbatim PDF and submit to publish")),
      ],
    };
    case "token-group-flow": return {
      caption: t("Mencabut atau menghapus token juga menghapus kelompok belajar yang terhubung.",
        "Revoking or deleting a token also removes its linked study group."),
      rows: [
        row(t("Admin buat token", "Admin issues token"), "Zyx-XXXXXXXX-{capacity}-{courseIds.length}"),
        row(t("Murid aktivasi", "Student redeems"), t("Masuk ke kelompok belajar yang terhubung", "Joins the linked study group")),
        row(t("Akses aktif", "Access unlocked"), t("Mata kuliah dan kuota mingguan", "Courses and weekly quota")),
      ],
    };
    case "meet-access-modes": return {
      caption: t("Slug Meet Studio dan Form Studio berbagi ruang nama /f/{slug}.", "Meet Studio and Form Studio share the /f/{slug} namespace."),
      rows: [
        row("Open", t("Siapa saja dengan tautan dapat bergabung.", "Anyone with the link can join.")),
        row("Trusted", t("Peran atau mata kuliah terpilih dapat langsung masuk.", "Selected roles and courses can join without knocking.")),
        row("Restricted", t("Hanya anggota yang ditambahkan dapat masuk.", "Only explicitly invited members may enter.")),
      ],
    };
    default: return getTutorDocDiagram(id, locale);
  }
}
