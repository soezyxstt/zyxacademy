# Product family methods

## Aturan bersama

Setiap produk adalah instrumen belajar berbeda, bukan prose yang sama dalam wadah lain. Produk berakar pada Idea resmi dan source excerpt. Artikel adalah baseline pengajaran lengkap.

## Diktat

Diktat adalah turunan ringkas untuk review dari Artikel yang sudah lulus. Diktat bukan buku teks kedua dan tidak boleh mengenalkan klaim baru. Gunakan hanya Artikel terintegrasi. Bila informasi penting hilang, perbaiki Artikel terlebih dahulu.

Pertahankan definisi, formula, kondisi, miskonsepsi penting, aplikasi inti, hubungan Idea, dan traceability. Ringkas transisi serta aktivitas belajar. Isi dirender sebagai Markdown dan matematika di preview admin, lalu dapat dipakai pipeline Zyx untuk HTML atau PDF cetak.

## Flashcard

Satu flashcard menguji satu target retrieval dari satu Idea. Front berisi satu prompt jelas. Back ringkas tetapi cukup. Pisahkan definition recall, simbol, kondisi, keputusan prosedural, miskonsepsi, dan interpretasi bila merupakan target independen. Jangan mengenalkan pengetahuan yang belum diajarkan Artikel.

Setiap card memakai satu Idea link dengan weight 1 dan berada dalam `flashcard_set` yang dideklarasikan.

## Soal

Buat assessment matrix untuk Idea coverage, difficulty, cognitive level, reasoning pattern, type, dan chapter. Soal harus mengukur bentuk pemahaman yang jelas. Distractor harus plausible dan diagnostik. Lakukan blind solve sebelum melihat key.

Semua question Product Bundle harus dibawa langsung dari contoh soal ITB di Source Pack. Lakukan loop berikut untuk setiap question:

1. Temukan stem, opsi, formula, tabel, dan visual explanation asli beserta source unit.
2. Tentukan nama event yang benar-benar tertulis pada dokumen atau unit.
3. Cari entry allowed dalam `entities/benchmark-summaries.json` dengan `sourceLabel` exact yang sama.
4. Salin field `referenceId`, bukan field `id`, ke `itbSource.referenceId` dan entry `itbCuration.referenceId`.
5. Salin `sourceLabel` exact ke `itbSource.eventName`.
6. Transkripsikan stem dan opsi tanpa parafrasa, perubahan angka, penggantian konteks, atau adaptasi tingkat kesulitan.
7. Catat source document, source unit, benchmark ID, reference ID, source label, dan hasil exact-match pada quality report.

Normalisasi encoding, whitespace, delimiter matematika, dan struktur opsi diperbolehkan hanya bila makna tetap identik. Jika soal bergantung pada visual yang tidak dapat direpresentasikan secara setia oleh kontrak Product, tandai blocked. Jika allowed reference yang sesuai tidak tersedia, metadata `referenceId` atau `sourceLabel` hilang, atau soal asli tidak ada di Source Pack, hentikan family question, solution, dan blueprint. Jangan mengisi gap dengan soal buatan Zyx.

Karena source question adalah reference itu sendiri, gunakan nilai `similar` untuk keempat dimensi curation kecuali kontrak atau operator memberikan bukti eksplisit yang berbeda. Curation tambahan boleh dipakai untuk pembandingan, tetapi tidak menjadi sumber sitasi.

## Solusi

Buat solusi dalam pass terpisah dari penyalin soal. Jika Source Pack memuat pembahasan resmi, pertahankan metode dan hasilnya serta perjelas render tanpa mengubah substansi. Jika pembahasan tidak tersedia, selesaikan soal secara mandiri dari sumber dan Idea resmi, lalu verifikasi jawaban dengan blind solve kedua. Satu question memiliki tepat satu solution yang menjelaskan interpretasi data, Idea pengendali, langkah penalaran, perhitungan dan unit, kesimpulan, serta diagnosis distractor atau rubrik jika relevan. Jika solusi membutuhkan pengetahuan yang belum ada di Artikel, perbaiki Artikel.

## Assessment blueprint

Blueprint adalah rencana assembly, bukan daftar seluruh soal. Pilih question dalam bundle menurut coverage, difficulty, cognitive diversity, beban, chapter, dan ketersediaan solusi. Quiz memakai tepat satu chapter. Tryout memakai satu atau lebih chapter.

## Loop per family

1. Buat plan dan coverage matrix.
2. Generate batch kecil.
3. Jalankan schema check.
4. Audit pedagogis dan source grounding.
5. Revisi item gagal saja.
6. Audit ulang dengan konteks segar.
7. Merge collection.
8. Audit coverage dan duplicate global.
9. Simpan checkpoint.
10. Pindah family hanya jika issue blocking nol.
