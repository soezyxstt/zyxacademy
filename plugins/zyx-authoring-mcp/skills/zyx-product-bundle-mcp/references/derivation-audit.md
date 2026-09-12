# Bukti ketuntasan dan penurunan produk

Baca sebelum outline. Panduan ini mendefinisikan cara membuktikan peran produk, bukan schema JSON tambahan. Semua tabel di sini adalah catatan kerja di luar ZIP dan tidak dirender untuk mahasiswa.

## 1. Bekukan scope dan evidence

Catat course/chapter, tujuan yang diminta, Source Pack checksum, run/contract checksum, published Idea version/hash, dan daftar produk yang diminta. Jangan mengambil materi dari bab lain untuk menutup kekurangan diam-diam. Prasyarat luar scope diberi bantuan singkat yang source-grounded; bila bukti tidak ada dan prasyarat menentukan pemahaman, laporkan gap.

Source Pack adalah bukti asli. Idea mengikat pengetahuan dan provenance. Artikel mengajarkan isi scope secara mandiri. Diktat dan Flashcard hanya mengambil pengetahuan yang sudah hadir dalam Artikel. Pengetahuan umum model boleh membantu cara menjelaskan, bukan menjadi bukti fakta baru.

## 2. Matriks Artikel sebelum drafting

Satu baris untuk setiap tujuan yang dapat diamati:

| Tujuan | Primary Idea dan source locator | Prasyarat yang harus dijelaskan | Block penjelasan | Contoh dan alasan relevansi | Cek, jawaban, pembahasan | Hasil |
|---|---|---|---|---|---|---|
| Menentukan kapan aturan berlaku | ID dan excerpt internal yang benar-benar dibaca | Istilah/kondisi yang dipakai | Lokasi section/block setelah ditulis | Kasus berlaku dan tidak berlaku bila kondisi menentukan keputusan | Cek keputusan beserta alasannya | PASS/FAIL |

Jangan memakai “memahami topik” sebagai tujuan tanpa keluaran yang dapat diperiksa. Gunakan keluaran seperti menjelaskan hubungan, memilih metode beserta alasan, menghitung beserta kondisi, atau membedakan dua kasus.

Semua primary Idea scope harus memiliki baris. Satu tujuan boleh mencakup beberapa Idea yang memang diperlukan, tetapi setiap Idea harus diajarkan eksplisit di topic utamanya. Judul, `ideaLinks`, atau penyebutan nama konsep saja tidak memenuhi coverage.

## 3. Putuskan elemen kondisional

Gunakan aturan berikut untuk setiap topic. Simpan alasan bila tidak berlaku, lalu petakan ke status/reason enum yang benar dari contract.

| Elemen | Wajib bila | Bukti lulus |
|---|---|---|
| Prasyarat/remediasi | Ada istilah, notasi, atau operasi yang belum dijelaskan sebelum dipakai | Penjelasan singkat tersedia sebelum pemakaian; referensi eksternal bukan pengganti |
| Rumus | Tujuan memakai hubungan matematis | Simbol, satuan bila ada, domain, asumsi, dan makna hasil tertulis |
| Worked example | Tujuan meminta penerapan, prosedur, perhitungan, pembuktian, atau keputusan metode | Masalah lengkap, alasan memilih metode, langkah beralasan, verifikasi hasil |
| Visual | Tujuan bergantung pada relasi ruang, bentuk grafik, aliran, susunan, atau perbandingan yang sulit dibaca dari teks saja | Payload typed aman, label jelas, caption informatif, fallback teks bermakna |
| Miskonsepsi/batas | Sumber menunjukkan kesalahan atau aturan memiliki kondisi yang dapat menghasilkan keputusan salah | Kesalahan/kasus batas dijelaskan dan dikoreksi berdasarkan bukti |
| Analogi | Ada pemetaan yang akurat dan membantu intuisi | Hubungan yang dipetakan dan batas analogi disebut; bila tidak ada, abaikan analogi |

Tujuan, penjelasan inti, provenance, serta cek dengan jawaban dan pembahasan selalu wajib. Jangan memberi `NOT_APPLICABLE` pada empat hal itu. Graph sampling bukan pembuktian analitik. Contoh pedagogis baru boleh memakai data hipotetis yang dinyatakan jelas dan dihitung dari aturan source-grounded; jangan mengklaimnya sebagai data/soal asli sumber.

## 4. Audit pembaca Artikel saja

Baca urut dari overview sampai summary tanpa membuka sumber. Untuk setiap cek, selesaikan dengan hanya informasi pada Artikel. Catat block yang menyediakan setiap konsep dan kondisi penyelesaian.

FAIL jika ada istilah belum didefinisikan, langkah penting melompat, rumus tanpa kondisi, jawaban tanpa alasan, atau arahan “lihat PDF/Diktat/kartu” untuk mendapatkan pengetahuan yang dibutuhkan. Referensi tambahan boleh sebagai atribusi atau pendalaman, tetapi tidak boleh diperlukan untuk mencapai tujuan scope.

Jangan memperbaiki gap hanya dengan menambahkan link atau menyisipkan penjelasan ke answer key. Ajarkan konsep di penjelasan Artikel sebelum cek. Jalankan ulang cek setelah revisi.

## 5. Turunkan Diktat per item

Setelah Artikel lulus, susun tabel berikut untuk setiap item Diktat:

| Item Diktat | Lokasi Artikel + kutipan pendukung singkat | Fungsi review | Kondisi yang dipertahankan | Hasil |
|---|---|---|---|---|
| Ringkasan konsep/rumus/prosedur/jebakan/cek | Section/block aktual, bukan hanya Idea ID | Mengingat konsep, memilih aturan, atau mengecek kesalahan | Domain, asumsi, pengecualian yang memengaruhi kebenaran | PASS/FAIL |

“Penting” berarti termasuk primary Idea scope, diperlukan untuk mencapai tujuan, atau menentukan kapan jawaban/metode benar. Seluruh Idea scope harus tetap terwakili; kurangi pengulangan dan uraian pengantar, bukan cakupan atau syarat kebenaran. Jangan memaksakan formula/prosedur pada bab yang tidak memilikinya.

Urutan kerja: petakan konsep, pilih intisari tiap topic, ringkas rumus dengan kondisi, tampilkan langkah keputusan, pilih contoh kilat dari Artikel, rangkum jebakan yang sudah dijelaskan, lalu buat retrieval check beserta jawaban ringkas untuk self-review. Contoh kilat merujuk solusi yang sudah diajarkan; jangan menyembunyikan cara baru di contoh Diktat.

Diktat lulus jika tiap item punya evidence Artikel dan membantu review cepat setelah belajar. Panjang teks bukan satu-satunya ukuran: buang pembukaan berulang, analogi panjang, dan derivasi lengkap yang sudah ada di Artikel; pertahankan langkah keputusan dan batas penggunaan. Jika pemadatan tetap tidak cukup untuk PDF 2 sampai 4 halaman, laporkan konflik scope. Jangan menghapus Idea atau mengecilkan font untuk mengejar halaman.

Contoh dengan asumsi Artikel telah mengajarkan pembagian ketaksamaan:

- Gagal: “Bagi kedua ruas dengan a.” Syarat tanda a hilang.
- Lulus: “a > 0: arah tetap. a < 0: balik arah. a = 0: pembagian tidak sah.”

Ini pola editorial, bukan fakta yang boleh dipakai jika tidak didukung Artikel scope aktual.

## 6. Turunkan Flashcard per target

Buat tabel: card ID internal, satu recall target, lokasi Artikel + kutipan jawaban, front, back, alasan perlu diingat, kartu bertarget sama, hasil. Terapkan [flashcard-guide.md](flashcard-guide.md).

Setiap klausa faktual pada back dan explanation harus punya evidence Artikel. Satu block dapat mendukung beberapa kartu jika targetnya berbeda. Satu kartu tidak boleh menggabungkan target independen.

Contoh dengan asumsi konsep sudah diajarkan:

- Gagal: “Jelaskan pembagian ketaksamaan dan berikan tiga contoh.” Meminta penalaran dan beberapa keluaran.
- Lulus front: “Apa yang terjadi pada arah ketaksamaan saat kedua ruas dibagi bilangan negatif?”
- Lulus back: “Arah ketaksamaan berbalik.”

Jika kartu tidak dapat dibuat atomic tanpa kehilangan kondisi penting, ubah front agar kondisi eksplisit, atau tinggalkan kandidat dengan alasan. Tidak ada kuota satu kartu per Idea.

## 7. Revisi dan bukti akhir

Jika Diktat/Flashcard membutuhkan fakta yang belum ada: cari bukti sumber dalam scope, perbaiki Artikel dahulu bila sah, ulangi audit tujuan/cek terkait, lalu regenerasi turunan dan hash terkait. Jika tidak didukung sumber, hapus kandidat yang opsional; bila fakta wajib untuk scope, laporkan blocker. Jangan langsung meminta keputusan untuk kekurangan yang dapat diperbaiki dari bukti yang sudah ada.

Sebelum validate dan submit, laporkan jumlah tujuan lulus/total, Idea tercakup/total, item Diktat terpetakan/total, kartu terpetakan/total, serta daftar FAIL. Tidak boleh ada FAIL saat submit. `NOT_APPLICABLE` harus punya alasan dan hanya dipakai pada elemen kondisional. Angka laporan dihitung dari tabel, bukan perkiraan.

PDF belum dirender berarti `NOT_RENDERED`, bukan lulus/gagal otomatis untuk draft authoring. Readiness PDF hanya `VERIFIED` setelah artifact revisi yang sama benar-benar dirender 2 sampai 4 halaman dan semua halaman diperiksa. Render gagal, stale, atau di luar rentang berarti `BLOCKED` untuk PDF readiness. Status ini adalah label laporan author, bukan field payload atau izin publish.
