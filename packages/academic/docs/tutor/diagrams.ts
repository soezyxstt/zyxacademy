import type { DocDiagramId, DocLocale } from "../types";

type TutorDiagramRow = { title: string; note: string };

export type TutorDocDiagram = {
  caption: string;
  rows: TutorDiagramRow[];
};

export function getTutorDocDiagram(id: DocDiagramId, locale: DocLocale): TutorDocDiagram | null {
  const en = locale === "en";
  switch (id) {
    case "tutorial-schedule-lifecycle": return {
      caption: en
        ? "Tutorial session lifecycle in Asia/Jakarta time. Online bookings and approved reschedule tickets generate Google Meet rooms automatically."
        : "Siklus sesi tutorial dalam zona waktu Asia/Jakarta. Pemesanan daring dan tiket pindah jadwal yang disetujui otomatis membuat ruang Google Meet.",
      rows: [
        { title: en ? "1. Dated 90-min slot" : "1. Slot 90 menit bertanggal", note: en ? "Tutor opens availability" : "Tutor membuka ketersediaan" },
        { title: en ? "2. Group books" : "2. Kelompok memesan", note: en ? "Uses 1 quota + auto Meet link" : "Pakai 1 kuota + tautan Meet otomatis" },
        { title: en ? "3. Session & notes" : "3. Sesi & berkas", note: en ? "Prep files, summary (<= 10 MB)" : "Bahan, ringkasan (<= 10 MB)" },
      ],
    };
    case "quiz-vs-tryout":
    case "tutor-grading-flow": return {
      caption: en
        ? "Scope and grading flow: objective items grade automatically; final scores unlock once all essay items are graded."
        : "Cakupan dan alur penilaian: soal objektif dinilai otomatis; nilai akhir tampil ke murid setelah seluruh esai selesai dinilai.",
      rows: [
        { title: en ? "Quiz (1 chapter)" : "Kuis (tepat 1 bab)", note: en
          ? "Total timer + optional per-question timer (sum must match total)."
          : "Batas waktu total + opsional timer per soal (jumlah harus sama dengan total)." },
        { title: en ? "Tryout (1+ chapters)" : "Tryout (1 atau beberapa bab)", note: en
          ? "Objective auto-graded; essay items wait in Quiz/Tryout grading queue."
          : "Objektif dinilai otomatis; soal esai masuk antrean Penilaian kuis/tryout." },
      ],
    };
    case "tutor-workspace-map": return {
      caption: en
        ? "Tutor workspace map: switch between cross-course operations and individual course tools."
        : "Peta ruang kerja tutor: berpindah antara operasional lintas kelas dan alat khusus per mata kuliah.",
      rows: [
        { title: en ? "Cross-course" : "Lintas kelas", note: en
          ? "Schedule & 90-min slots · Unified discussions inbox"
          : "Jadwal & slot 90 menit · Kotak masuk diskusi" },
        { title: en ? "Inside each course" : "Di dalam mata kuliah", note: en
          ? "Documents, Videos & Participants · Quizzes, Essay Grading & Live Quiz"
          : "Dokumen, Video & Peserta · Kuis, Penilaian Esai & Kuis Langsung" },
      ],
    };
    case "tutor-live-quiz-flow": return {
      caption: en
        ? "Live Quiz flow: hosted in real time from the course Live Quiz console."
        : "Alur Kuis langsung: dipandu secara real-time dari konsol Kuis langsung di mata kuliah.",
      rows: [
        { title: en ? "1. Open lobby" : "1. Buka ruang tunggu", note: en ? "Enrolled students join" : "Peserta kelas bergabung" },
        { title: en ? "2. Pace questions" : "2. Kendalikan tempo", note: en ? "Watch live responses" : "Pantau jawaban masuk" },
        { title: en ? "3. Review & finish" : "3. Bahas & akhiri", note: en ? "Discuss & show results" : "Bahas soal & papan hasil" },
      ],
    };
    default: return null;
  }
}
