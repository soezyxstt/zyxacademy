# Perbaikan UX Pembelajaran Siswa

Status: `OPEN / IN PROGRESS`

## Tujuan

Merapikan Dokumen, Flashcard, Kuis, Tryout, Alur Belajar, Trivia Harian, serta Zyra siswa. Perubahan harus mengurangi card dan ruang kosong, memperjelas tindakan berikutnya, menjaga data tetap terikat ke mata kuliah aktif, dan membuat panel Zyra mengecilkan konten desktop tanpa menimpanya.

Tidak ada feature flag atau schema baru. Backfill thumbnail adalah operasi terpisah yang tidak boleh dijalankan ke staging tanpa otorisasi eksplisit.

## Checkpoint 1: Cleanup permukaan siswa

- [x] Tambahkan aksi header pada `CoursePageShell`.
- [x] Pindahkan filter Kuis ke header dan hapus panel konsep terlemah.
- [x] Hapus banner batas Tryout tanpa mengubah enforcement.
- [x] Hapus `Tanya Zyra` dari sidebar siswa.
- [ ] Verifikasi toolbar dan sidebar pada 380 px serta desktop.

## Checkpoint 2: Dokumen minimal dan thumbnail asli

- [x] Gunakan reusable `SearchBar`.
- [x] Satukan tipe, subkategori, bab, dan tahun dalam satu popover filter multi-select.
- [x] Terapkan OR dalam kelompok dan AND antar kelompok.
- [x] Susun search, filter, dan mode tampilan dalam satu toolbar responsif.
- [x] Ganti nested card dengan file tile minimal dan list padat.
- [x] Hapus thumbnail berbasis `iframe`.
- [x] Rasterisasi halaman pertama melalui `PDFParse.getScreenshot()`, konversi ke WebP, dan simpan dengan storage key resmi.
- [x] Hubungkan generator ke upload materi dan render Diktat.
- [x] Sediakan skrip backfill idempotent dengan `--dry-run` dan `--apply`.

## Checkpoint 3: Flashcard berorientasi mastery

- [x] Pertahankan eligibility SM-2 untuk kartu baru atau jatuh tempo.
- [x] Hubungkan kartu canonical ke Idea dan `pemahaman_ide`.
- [x] Supresi mastery 80 atau lebih.
- [x] Urutkan mastery terendah, kartu baru, jatuh tempo, lalu ID stabil.
- [x] Letakkan fallback tanpa Idea setelah kartu yang terpetakan.
- [x] Tampilkan alasan prioritas.
- [x] Tambahkan `Lewati` tanpa mutation dan masukkan kartu ke belakang antrean sesi.
- [x] Pastikan grading selalu maju dan `Ulangi` kembali ke belakang antrean.
- [x] Ganti pengulangan antrean stale dengan refresh antrean atau kembali ke ringkasan.

## Checkpoint 4: Roadmap Alur Belajar

- [x] Tambahkan ID langkah, bab, urutan bab, dan alasan prioritas pada kontrak.
- [x] Kelompokkan langkah per bab.
- [x] Tampilkan satu blok `Lanjutkan belajar` dengan CTA utama.
- [x] Collapse mastered secara default dan tampilkan locked setelah langkah aktif.
- [x] Tampilkan prerequisite sebagai kalimat sederhana.
- [x] Buat target hari dan rencana harian sebagai toolbar serta accordion ringkas.
- [ ] Verifikasi loading, error, empty, dan responsive state.

## Checkpoint 5: Panel dan floating pet Zyra

- [x] Scope provider ke layout siswa.
- [x] Jadikan panel sibling flex pada desktop dan overlay pada mobile.
- [x] Samakan batas resize, keyboard resize, persistence, focus return, dan scroll lock dengan pola Ops AI.
- [x] Sederhanakan header, message surface, dan composer tanpa menghapus capability Zyra.
- [x] Simpan posisi pet sebagai salah satu dari empat anchor aman.
- [x] Gunakan pointer capture, frame-based drag, click suppression, dan snap animation.
- [x] Hormati resize viewport, sidebar, dan reduced motion.

## Checkpoint 6: Trivia fail-closed

- [x] Batasi ke course aktif, status active dan published, tidak stale, serta tag `trivia`.
- [x] Terima hanya MCQ dengan opsi, kunci, dan pembahasan valid.
- [x] Wajibkan anchor KO atau Idea published pada course yang sama.
- [x] Tolak survey, feedback, form, dan data malformed.
- [x] Gunakan pilihan harian deterministik berdasarkan hari Jakarta dan course ID.
- [x] Hapus fallback hard-coded dan sembunyikan surface jika tidak ada soal eligible.

## Checkpoint 7: Validasi dan dokumentasi

- [x] Tambahkan focused tests untuk filter, thumbnail, ranking flashcard, roadmap, Zyra, dan trivia.
- [ ] Jalankan `bun run lint`, `bun run typecheck`, `bun run build`, dan `git diff --check`.
- [ ] Jalankan visual checks pada 380 x 844 dan 1536 x 864 untuk semua route dan state yang berubah.
- [ ] Inspeksi setiap screenshot dan pastikan tidak ada HTTP 400+, redirect tak terduga, console error, page error, atau overflow.
- [x] Perbarui `docs/features.md`, `docs/ARCHITECTURE.md`, dan registry ini.
- [ ] Ubah status menjadi `COMPLETED / RESOLVED` hanya setelah seluruh gate lulus.

Catatan validasi 3 September 2026: focused tests, typecheck, dan lint pada seluruh file yang berubah lulus. Visual test dibatalkan atas arahan operator. Full lint dan build tidak dijalankan sampai selesai sebelum delivery, sehingga status plan tetap `OPEN / IN PROGRESS`.
