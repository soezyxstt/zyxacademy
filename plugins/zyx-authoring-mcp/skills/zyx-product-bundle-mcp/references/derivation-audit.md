# Bukti ketuntasan dan penurunan produk

Baca sebelum outline. Panduan ini mendefinisikan cara membuktikan peran produk, bukan schema JSON tambahan. Semua tabel di sini adalah catatan kerja di luar ZIP dan tidak dirender untuk mahasiswa.

## 1. Bekukan scope dan evidence

Catat course/chapter, tujuan yang diminta, Source Pack checksum, run/contract checksum, published Idea version/hash, dan daftar produk yang diminta. Jangan mengambil materi dari bab lain untuk menutup kekurangan diam-diam. Prasyarat luar scope diberi bantuan singkat yang source-grounded; bila bukti tidak ada dan prasyarat menentukan pemahaman, laporkan gap.

Source Pack adalah bukti asli. Idea mengikat pengetahuan dan provenance. Artikel mengajarkan isi scope secara mandiri. Diktat dan Flashcard hanya mengambil pengetahuan yang sudah hadir dalam Artikel. Pengetahuan umum model boleh membantu cara menjelaskan, bukan menjadi bukti fakta baru.

## 2. Matriks Artikel sebelum drafting

Satu baris untuk setiap tujuan yang dapat diamati. Tandai target/Idea dan unsur terkait sebagai `WAJIB`, `PENDUKUNG`, atau `TAMBAHAN` berdasarkan tujuan serta bukti. Klasifikasi ini membantu prioritas, tetapi tidak boleh melanggar primary Idea coverage atau batas contract.

| Tujuan dan prioritas | Primary Idea dan source locator | Prasyarat yang harus dijelaskan | Block penjelasan | Formula, simbol, dan kondisi | Contoh dan alasan relevansi | Visual/emphasis, fallback, dan alasan | Cek, jawaban, pembahasan | Status dan bukti |
|---|---|---|---|---|---|---|---|---|
| Menentukan kapan aturan berlaku (`WAJIB`) | ID dan excerpt internal yang benar-benar dibaca | Istilah/kondisi yang dipakai | Lokasi section/block setelah ditulis | Kasus berlaku dan tidak berlaku bila kondisi menentukan keputusan | - | - | Cek keputusan beserta alasannya | `PASS`/`FAIL`/`NOT_APPLICABLE`/`NOT_TESTED` plus lokasi bukti |

Jangan memakai “memahami topik” sebagai tujuan tanpa keluaran yang dapat diperiksa. Gunakan keluaran seperti menjelaskan hubungan, memilih metode beserta alasan, menghitung beserta kondisi, atau membedakan dua kasus.

Semua primary Idea scope harus memiliki baris. Satu tujuan boleh mencakup beberapa Idea yang memang diperlukan, tetapi setiap Idea harus diajarkan eksplisit di topic utamanya. Judul, `ideaLinks`, atau penyebutan nama konsep saja tidak memenuhi coverage.

Untuk tujuan matematika, kolom formula harus menunjuk display math dan penjelasan simbol atau kondisi yang menyertainya. Formula yang hanya muncul di tengah prose panjang adalah `FAIL`, meskipun string LaTeX-nya valid. Catat kandidat emphasis dengan token typed yang diizinkan, bukan warna atau HTML buatan author.

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

Visual interaktif wajib mencatat variabel/control id, rentang, step, default, binding, alasan interaksi, dan uji keyboard. Grafik transformasi wajib membedakan kurva acuan `dashed` dan kurva hasil `solid`. Setiap visual memiliki fallback static untuk PDF/no-JS. Jika renderer atau contract belum mendukung kebutuhan itu, statusnya `NOT_APPLICABLE` atau `BLOCKED`, bukan payload bebas.

## 4. Audit pembaca Artikel saja

Baca urut dari overview sampai summary tanpa membuka sumber. Untuk setiap cek, selesaikan dengan hanya informasi pada Artikel. Catat block yang menyediakan setiap konsep dan kondisi penyelesaian.

FAIL jika ada istilah belum didefinisikan, langkah penting melompat, rumus tanpa kondisi, jawaban tanpa alasan, atau arahan “lihat PDF/Diktat/kartu” untuk mendapatkan pengetahuan yang dibutuhkan. Referensi tambahan boleh sebagai atribusi atau pendalaman, tetapi tidak boleh diperlukan untuk mencapai tujuan scope.

Jangan memperbaiki gap hanya dengan menambahkan link atau menyisipkan penjelasan ke answer key. Ajarkan konsep di penjelasan Artikel sebelum cek. Jalankan ulang cek setelah revisi.

## 5. Turunkan Diktat per item

Setelah Artikel lulus, susun tabel berikut untuk setiap konsep wajib dan setiap unsur pendukung/tambahan yang dimasukkan ke Diktat:

| Konsep/prioritas | Lokasi Artikel + kutipan pendukung singkat | Aksi kompresi | Fungsi review | Kondisi/notasi yang dipertahankan | Pertanyaan recall/penerapan | Jawaban dan alasan singkat | Contoh bila tujuan perlu penerapan | Dampak page budget | Bukti render | Status |
|---|---|---|---|---|---|---|---|
| Konsep inti (`WAJIB`) | Section/block aktual, bukan hanya Idea ID | Dipadatkan, digabung, atau dihapus dengan alasan | Mengingat konsep, memilih aturan, atau mengecek kesalahan | Domain, asumsi, pengecualian yang memengaruhi kebenaran | Satu cek yang sesuai tujuan | Jawaban dapat diperiksa dan menjelaskan alasan | Lokasi contoh Artikel bila penerapan diperlukan | Perkiraan kepadatan, bukan pengganti page count | Hash, renderer/profile, page count, inspeksi halaman | Status dan lokasi bukti |

`WAJIB` berarti langsung memenuhi tujuan, termasuk primary Idea yang wajib dicakup, atau menentukan kapan jawaban/metode benar. `PENDUKUNG` membantu memahami atau memakai konsep wajib. `TAMBAHAN` berguna untuk pendalaman, tetapi tidak dibutuhkan untuk tujuan scope. Seluruh primary Idea yang diwajibkan contract harus tetap terwakili; ringkas unsur pendukung dan hilangkan tambahan hanya bila tidak wajib untuk coverage. Jangan memaksakan formula/prosedur pada bab yang tidak memilikinya.

Urutan kerja: petakan konsep dan prioritas, pilih intisari tiap topic, ringkas rumus dengan kondisi serta notasi Artikel, tampilkan langkah keputusan, pilih contoh kilat dari Artikel, rangkum jebakan yang sudah dijelaskan, lalu buat sedikitnya satu cek recall/penerapan untuk setiap konsep inti beserta jawaban yang dapat diperiksa dan alasan singkat. Setiap tujuan yang memang meminta penerapan juga memiliki contoh representatif yang dirujuk dari Artikel. Contoh kilat merujuk solusi yang sudah diajarkan; jangan menyembunyikan cara baru di contoh Diktat.

Diktat lulus jika setiap unsur punya bukti Artikel dan membantu review cepat setelah belajar. Buang pembukaan berulang, analogi panjang, derivasi lengkap, dan contoh yang tidak mengubah keputusan; pertahankan langkah keputusan dan batas penggunaan. Tujuan editorial adalah paling ringkas dan terbaca, maksimal 4 halaman A4, tanpa target minimum atau filler. Body font tetap 10.5 pt tanpa auto-shrink. Contract saat ini tetap mensyaratkan 2 sampai 4 halaman; bila isi lengkap muat 1 halaman, jangan menambah isi hanya untuk mencapai minimum. Tandai mutu isi sesuai bukti dan PDF `BLOCKED` oleh contract sampai batas tersebut diperbarui. Jika pemadatan yang sah belum muat dalam 4 halaman, laporkan konflik scope. Jangan menghapus Idea, formula, contoh yang perlu untuk tujuan, atau syarat kebenaran.

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

Sebelum validate dan submit, laporkan jumlah tujuan lulus/total, Idea tercakup/total, konsep inti Diktat yang memiliki cek dan jawaban/total, contoh yang diwajibkan/tersedia, kartu terpetakan/total, status yang belum selesai, serta daftar FAIL. Tidak boleh ada hard fail saat submit. `NOT_APPLICABLE` harus beralasan dan hanya dipakai pada elemen kondisional. Gunakan `NOT_TESTED` untuk bukti manusia, mahasiswa, browser, perangkat, atau PDF tagged yang belum tersedia. Hitung jumlah dari tabel, bukan perkiraan.

PDF belum dirender berarti `NOT_RENDERED`, bukan bukti mutu visual. Readiness PDF hanya `VERIFIED` setelah artifact revisi yang sama benar-benar dirender 2 sampai 4 halaman dan semua halaman diperiksa. Catat checksum, renderer/profile, jumlah halaman, dan hasil inspeksi formula/glyph, clipping, pemisahan konten, footer, serta pencarian teks bila alat tersedia. Render gagal, stale, atau di luar rentang berarti `BLOCKED` untuk PDF readiness. Cetak fisik, navigasi pembaca layar, tag PDF, WCAG, dan uji pengguna tetap `NOT_TESTED` kecuali benar-benar diperiksa. Status ini adalah label laporan author, bukan field payload atau izin publish.
