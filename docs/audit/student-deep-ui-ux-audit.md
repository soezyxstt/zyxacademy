# Audit Kualitas UI/UX: Halaman Mahasiswa (Student Perspective)

Tanggal: 2026-09-03. Status: COMPLETED / RESOLVED. Seluruh 8 temuan audit (AUD-STU-01 s/d AUD-STU-08) telah berhasil diimplementasikan dan diverifikasi dengan kompilasi TypeScript bersih (0 error).

---

## 1. Ringkasan Eksekutif

Audit ini meninjau seluruh 37 berkas rute halaman mahasiswa (`app/(student)/**/*.tsx`) beserta komponen antarmuka terkait. Seluruh temuan telah diperbaiki secara terukur sesuai standar desain repository di `AGENTS.md`.

| Kriteria Evaluasi | Status Akhir | Catatan Resolusi |
|---|---|---|
| Halaman Dead-End / Placeholder | Teratasi Penuh | `/feedback` fungsional dengan server action; `/calendar` merender agenda kuis, tryout, dan tutorial |
| Konsistensi PageHeader & Shell | Teratasi Penuh | `CoursePageShell` dinormalisasi dengan dukungan navigasi `backHref` dan pembersihan prop |
| Standarisasi Bahasa (Indonesian Copy) | Teratasi Penuh | Seluruh teks di `/settings`, `/settings/notifications`, dan `/profile/reflections` dialihkan ke bahasa Indonesia |
| Standarisasi Empty State | Teratasi Penuh | Kartu terstruktur berikon dan beraksi diterapkan pada kuis, penguasaan materi, dan dashboard |
| Penanganan Tanggal & Waktu | Teratasi Penuh | Seluruh manipulasi manual diganti dengan `FormattedDate` dan helper `lib/date-utils.ts` |
| Efisiensi Kueri SSR (N+1 Query) | Teratasi Penuh | Kueri serial di Leaderboard Global diubah menjadi `Promise.all` paralel berpenanganan defensif |
| Alur Retensi & Pasca-Kuis | Teratasi Penuh | Tombol pasca-kuis diperkaya dengan tautan langsung ke Riwayat Ujian terstruktur |
| Tipografi Kontrol & State-Invariant | Lolos | Kontrol input dan tombol konsisten mempertahankan `text-body-sm` |
| Pemakaian `rounded-full` | Lolos | Bentuk pill dihindari, radius 1:1 hanya untuk avatar dan indikator dot status |
| Bebas Em Dash dan En Dash | Lolos | Dokumentasi dan kode bersih dari karakter dash terlarang |

---

## 2. Metodologi dan Cakupan

1. **Analisis Statis Kode Sumber:** Pemeriksaan 37 file rute halaman di `app/(student)` dan lebih dari 20 komponen mahasiswa di `components/course/`, `components/dashboard/`, dan `components/schedule/`.
2. **Evaluasi Kontrak Desain `AGENTS.md`:** Validasi terhadap standar tipografi (Page title 24px, Section 16px, Body 16px, Controls 14px, Tabs/Meta 12px), token semantik Tailwind, larangan pill-shape, dan aturan penanganan tanggal.
3. **Analisis Alur Pengguna (User Journey Mapping):**
   - Alur Onboarding & Orientasi: Dari Dashboard menuju Kelas Aktif.
   - Alur Belajar & Membaca: Dari Daftar Dokumen menuju Reader, Flashcard, dan Kuis Bab.
   - Alur Evaluasi: Dari Pengerjaan Kuis menuju Ringkasan Skor, Pembahasan, dan Perbaikan Konsep Lemah.
   - Alur Komunitas & Bimbingan: Kelompok Belajar, Jadwal Sesi Tutor, dan Pengaturan Akun.

---

## 3. Temuan Audit Mendalam

### AUD-STU-01: Halaman Dead-End dan Komponen Placeholder (Tinggi)
Terdapat dua halaman mahasiswa yang berstatus placeholder kosong dan belum siap digunakan oleh siswa di lingkungan produksi:
1. **Halaman Feedback (`app/(student)/feedback/page.tsx`):**
   - Halaman hanya berisi teks deskripsi 2 baris dan tombol non-aktif `<Button disabled>Kirim Masukan</Button>`.
   - Siswa tidak memiliki formulir input teks, pilihan kategori umpan balik (materi, tutor, teknis sistem), maupun mekanisme pengiriman.
2. **Halaman Kalender Mahasiswa (`app/(student)/calendar/page.tsx`):**
   - Halaman hanya terdiri dari 21 baris kode yang merender kartu kosong bertuliskan *"Belum ada jadwal kegiatan."*.
   - Tidak ada kalender bulanan/mingguan, tidak ada daftar tenggat waktu kuis kelas yang sedang diikuti, dan tidak terhubung dengan jadwal tutorial kelompok.
- **Rekomendasi:**
  - Bangun form feedback fungsional dengan server action dan feedback kategori.
  - Hubungkan halaman Kalender dengan data jadwal kuis, tryout, dan sesi tutorial kelompok aktif.

---

### AUD-STU-02: Inkonsistensi Shell Halaman dan Silent Drop Deskripsi (Sedang)
Terdapat tiga pola pembungkus halaman yang berbeda di sisi mahasiswa:
1. `CoursePageShell` ([components/course/course-page-shell.tsx](file:///workspaces/zyx-edu/components/course/course-page-shell.tsx)): Memiliki tipe prop `description`, `eyebrow`, dan `headingTier`, namun pada baris 18-36 prop `description` tidak pernah di-destructure ataupun diteruskan ke `PageHeader`. Akibatnya, lebih dari 10 halaman kursus yang menyematkan deskripsi subtitle di-drop secara diam-diam tanpa dirender.
2. `ShellPage` ([components/shell-page.tsx](file:///workspaces/zyx-edu/components/shell-page.tsx)): Komponen pembungkus terpisah yang membungkus `PageHeader` di dalam container marketing. Menggunakan `title` bertipe string saja, tanpa dukungan ikon atau aksi kustom.
3. Pembungkus div manual pada `dashboard/page.tsx`, `dashboard/groups/page.tsx`, dan `leaderboard/page.tsx`.
- **Rekomendasi:**
  - Satukan pembungkus halaman ke `CoursePageShell` atau langsung gunakan `PageHeader` standar.
  - Bersihkan prop `description` yang di-deprecated agar selaras dengan aturan `PageHeader` ringkas di `AGENTS.md`.

---

### AUD-STU-03: Kebocoran Bahasa Asing pada Salinan Antarmuka (Sedang)
Beberapa halaman mahasiswa menggunakan bahasa Inggris penuh atau campuran yang tidak selaras dengan bahasa resmi platform (Bahasa Indonesia):
1. **Halaman Preferensi Notifikasi (`app/(student)/settings/notifications/page.tsx`):**
   - Menggunakan judul `Notification preferences`.
   - Menggunakan deskripsi `Choose which optional email you receive. Essential account messages remain enabled.`.
2. **Halaman Pengaturan (`app/(student)/settings/page.tsx`):**
   - Menggunakan tombol `Notification preferences`.
   - Menggunakan judul halaman `Settings`.
3. **Halaman Arsip Refleksi Mingguan (`app/(student)/profile/reflections/page.tsx`):**
   - Menggunakan judul `Weekly reflections`.
   - Menggunakan metrik `quizzes`, `flashcards`, `modules`, `day streak`, `Mastery`.
   - Empty state menggunakan teks `Reflections appear after your first active week.`.
- **Rekomendasi:**
  - Terjemahkan seluruh salinan teks menjadi bahasa Indonesia baku yang ramah, ringkas, dan sentence-case.

---

### AUD-STU-04: Standarisasi Empty State dan Ketiadaan Tombol Aksi (Sedang)
Regulasi `AGENTS.md` menyatakan bahwa antarmuka tidak boleh menampilkan teks polos mengambang di ruang kosong. Masih ditemukan beberapa pelanggaran:
1. **Daftar Kuis (`app/(student)/courses/[id]/quiz/quiz-list-client.tsx:228`):**
   Saat filter tidak menemukan kuis, hanya dirender `<p className="text-body-sm text-muted-foreground">Tidak ada kuis yang cocok.</p>` tanpa ikon pencarian atau tombol reset filter.
2. **Peta Penguasaan (`app/(student)/courses/[id]/mastery/page.tsx:158`):**
   Saat read model kosong, hanya merender kotak abu-abu bertuliskan teks polos tanpa ilustrasi atau saran aktivitas belajar.
3. **Aktivitas Ulasan Dashboard (`app/(student)/dashboard/page.tsx:618`):**
   Hanya merender `<p className="text-body-xs text-muted-foreground">Belum ada ulasan baru-baru ini.</p>`.
- **Rekomendasi:**
  - Terapkan kartu empty state terstruktur dengan ikon representatif, judul berbobot, kalimat panduan, dan tombol aksi (CTA) yang membawa siswa kembali ke alur belajar.

---

### AUD-STU-05: Pelanggaran Standar Penanganan Tanggal (Sedang)
Regulasi repository mewajibkan seluruh logika tanggal berada di `lib/date-utils.ts` menggunakan `date-fns` v4 atau `FormattedDate`. Ditemukan manipulasi tanggal manual:
1. **`app/(student)/dashboard/page.tsx:610`:**
   Memanggil `new Date(review.reviewedAt).toLocaleDateString("id-ID")` secara langsung pada objek server.
2. **`app/(student)/courses/[id]/quiz/quiz-list-client.tsx:200`:**
   Memanggil `closeDate.toLocaleString("id-ID", ...)` yang berisiko memicu perbedaan rendering hidrasi (hydration mismatch) antara server dan browser klien.
3. **`app/(student)/profile/reflections/page.tsx:17-36`:**
   Membuat fungsi pembantu manual `formatWeekLabel` menggunakan manipulasi `Date.UTC` dan pemanggilan `toLocaleDateString("en-US")`.
- **Rekomendasi:**
  - Ganti seluruh pemanggilan tanggal manual dengan `formatIsoDate()` dari `lib/date-utils.ts` atau komponen `FormattedDate`.

---

### AUD-STU-06: Kueri Serial N+1 pada Halaman Leaderboard Global (Sedang)
Pada halaman peringkat global (`app/(student)/leaderboard/page.tsx:34-42`):
```tsx
for (const course of allCourses) {
  const ranked = await getCourseLeaderboard(course.id);
  // ...
}
```
- Jika mahasiswa atau admin terdaftar di 8 kelas, halaman akan menunggu 8 kueri database yang dieksekusi secara berurutan (*waterfall/serial*), memperlambat waktu muat awal (TTFB).
- Jika salah satu kelas mengalami kegagalan kueri, seluruh halaman leaderboard akan melempar unhandled exception dan gagal dimuat.
- **Rekomendasi:**
  - Gunakan `Promise.allSettled` atau `Promise.all` dengan pembungkus `try/catch` defensif per kelas agar kueri berjalan paralel dan toleran terhadap kegagalan parsial.

---

### AUD-STU-07: UX Navigasi Pasca-Kuis dan Kebingungan Lokasi Pembahasan (Sedang)
Setelah mahasiswa menyelesaikan kuis, halaman diarahkan ke ringkasan diagnosis:
`/courses/[id]/quiz/[quizId]/summary/[attemptId]`
- Tombol aksi utama di kiri atas bertuliskan *"Lihat Pembahasan Jawaban"*, namun tombol tersebut mengarah ke URL player:
  `/courses/[id]/quiz/[quizId]?attemptId=[attemptId]`
  Padahal sistem juga memiliki halaman reviu permanen terstruktur:
  `/courses/[id]/my-results/[attemptId]`
- Situasi ini menimbulkan kebingungan mental bagi mahasiswa: apakah mereka sedang dalam mode mengerjakan kuis kembali, atau sedang meninjau arsip ujian.
- **Rekomendasi:**
  - Selaraskan alur navigasi agar tombol pembahasan kuis mengarah secara konsisten ke halaman reviu hasil ujian yang memiliki filter nomor soal, pembahasan Zyra AI, dan analisis kesalahan.

---

### AUD-STU-08: Ergonomi dan Quick-Access pada Tampilan Layar Ponsel (Minor)
1. Mahasiswa yang mengakses lewat smartphone saat ini mengandalkan tombol hamburger di pojok kiri atas untuk berpindah antara Dashboard, Kelas, Flashcard, dan Kuis.
2. Tidak adanya bilah navigasi bawah (*bottom navigation bar*) untuk aksi paling sering digunakan (misal: Beranda, Kelas Saya, Kuis & Tugas, Profil) membuat pengalaman belajar di mobile terasa seperti situs desktop yang diperkecil, bukan aplikasi web modern yang nyaman dioperasikan dengan satu tangan.
- **Rekomendasi:**
  - Sediakan bilah navigasi bawah ringkas (*mobile bottom navigation*) khusus tampilan layar ponsel (`< 768px`) untuk rute primer mahasiswa.

---

## 4. Prioritas Rencana Tindak Lanjut

| Prioritas | Kode Temuan | Tindakan Perbaikan |
|---|---|---|
| **P0 (Urgent)** | AUD-STU-01 | Fungsionalkan form masukan pada `/feedback` dan sediakan jadwal nyata pada `/calendar` |
| **P1 (High)** | AUD-STU-03 | Lokalisasi bahasa Indonesia pada `/settings`, `/settings/notifications`, dan `/profile/reflections` |
| **P1 (High)** | AUD-STU-02 | Normalisasi `CoursePageShell` dan `PageHeader`, hilangkan silent-drop deskripsi |
| **P1 (High)** | AUD-STU-06 | Paralelisasi kueri `Promise.all` dengan error handling per-kursus di `/leaderboard` |
| **P2 (Medium)** | AUD-STU-04 | Standarisasi kartu empty state beraksi pada daftar kuis, penguasaan, dan ulasan dashboard |
| **P2 (Medium)** | AUD-STU-05 | Migrasi manipulasi tanggal manual ke `lib/date-utils.ts` dan `FormattedDate` |
| **P2 (Medium)** | AUD-STU-07 | Konsolidasi rute pembahasan kuis ke halaman hasil ujian terpusat |
| **P3 (Polish)** | AUD-STU-08 | Implementasi mobile bottom navigation untuk akses cepat menu belajar |
