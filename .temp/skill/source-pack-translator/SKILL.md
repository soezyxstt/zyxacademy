---
name: source-pack-translator
description: Mengubah satu atau banyak PDF, DOCX, PPTX, spreadsheet, HTML, atau dokumen akademik lain menjadi Source Pack ZIP V1 yang lossless dan dapat diterima Authoring Job builder Zyx. Gunakan untuk transkripsi sumber akademik, termasuk materi dan contoh soal ITB, dengan unit lengkap, formula, tabel, visual explanation, metadata dokumen, coverage ledger, checksum, dan validasi akhir. Jangan gunakan untuk membuat Idea Bundle, Product Bundle, atau soal baru.
---

# Source Pack Translator

## Tujuan tunggal

Ubah dokumen asli menjadi representasi Markdown kanonik yang lengkap. Jangan membuat Idea, Artikel, Diktat, flashcard, soal baru, ringkasan, atau materi turunan. Keluaran skill ini adalah sumber setia untuk proses authoring berikutnya.

Gunakan Gemini yang mendukung input dokumen sebagai kendaraan ekstraksi utama. Pilih model Gemini document-capable terbaik yang tersedia di lingkungan eksekusi. Jangan diam-diam mengganti provider. Jika Gemini atau kemampuan membaca format sumber tidak tersedia, berhenti dan laporkan blocker serta dokumen yang belum diproses.

Sebelum mulai, temukan root repository Zyx dan baca kontrak aktif `lib/authoring/source-pack.ts`. Kontrak repository mengalahkan contoh dalam skill ini. Mulai state kerja dari `assets/state.template.json` dan simpan progres pada disk.

## Definisi lossless

Lossless berarti seluruh makna yang dapat dibaca dari dokumen tetap tersedia di Markdown:

- semua judul, paragraf, daftar, catatan kaki, caption, tabel, kode, dan metadata akademik yang relevan;
- semua formula beserta simbol, indeks, superskrip, batas, kondisi, satuan, dan definisi variabel;
- semua contoh, langkah penyelesaian, penerapan, pengecualian, peringatan, dan miskonsepsi;
- semua soal, opsi, kunci jika memang terlihat pada sumber, serta pembahasan;
- semua makna pada diagram, grafik, bagan, ilustrasi, foto instruksional, dan tata letak yang membawa informasi;
- urutan dokumen dan hubungan rujukan seperti "lihat Gambar 3" atau "gunakan Persamaan 2".

Lossless bukan berarti mempertahankan tampilan piksel. Untuk visual, pertahankan maknanya dalam blok penjelasan tekstual terstruktur. Jangan menyisipkan gambar visual ke Source Pack.

## Larangan keras

- Jangan meringkas, menyederhanakan, mengoreksi, atau mengajar ulang isi sumber.
- Jangan menggabungkan dua dokumen menjadi satu Markdown. Satu dokumen asli harus menghasilkan tepat satu Markdown.
- Jangan membuat fakta, formula, label gambar, jawaban, atau halaman yang tidak terlihat.
- Jangan menghapus pengulangan hanya karena tampak redundan. Jika ada di sumber, pertahankan.
- Jangan menerjemahkan bahasa kecuali pengguna memintanya. "Translasi" di sini berarti transformasi format ke Markdown.
- Jangan memakai OCR mentah sebagai hasil akhir tanpa pemeriksaan visual terhadap halaman.
- Jangan menulis `![...](...)`, `<img>`, data URL, atau file gambar ke Markdown final.
- Jangan menandai pack `complete` jika ada halaman, unit, formula, tabel, visual, soal, atau pembahasan yang belum direkonsiliasi.
- Jangan menebak teks yang buram. Gunakan penanda unresolved dan hentikan packaging final.
- Jangan menebak nama event, institusi, jenis ujian, mata kuliah, atau tahun sumber soal. Pertahankan label yang benar-benar tertulis pada sumber.
- Jangan memberi label soal sebagai soal asli Zyx atau contoh soal ITB tanpa bukti eksplisit pada dokumen.

## Kontrak keluaran

Buat `source-pack-{slug}.zip` dengan struktur tepat berikut:

```text
manifest.json
documents/001-{document-slug}.md
documents/002-{document-slug}.md
coverage/{document-id}.json
```

Daftar file bersifat dinamis, bukan daftar tiga file wajib. Buat tepat satu Markdown dan satu coverage ledger untuk setiap dokumen yang benar-benar diberikan. Contoh:

```text
manifest.json
documents/001-materi.md
documents/002-bank-soal.md
coverage/source-doc-001.json
coverage/source-doc-002.json
```

Jika input hanya satu PDF materi dan satu PDF soal tanpa dokumen pembahasan, hasil yang benar hanya memiliki dua pasangan file tersebut. Tetapkan hitungan solusi ke `0` jika sumber soal memang tidak memuat solusi. Jangan membuat `003-pembahasan.md`, jangan menebak pembahasan, dan jangan menganggap dokumen ketiga hilang.

Jangan sertakan binary asli secara default. Simpan checksum binary asli di manifest agar asal-usul tetap dapat diverifikasi. Sertakan binary hanya jika pengguna meminta dan kebijakan data mengizinkannya.

### `manifest.json`

Gunakan JSON UTF-8 tanpa komentar:

```json
{
  "schemaVersion": "zyx-source-pack.v1",
  "packId": "source-pack-nama-stabil",
  "name": "Nama pack",
  "language": "id",
  "createdAt": "2026-08-13T00:00:00.000Z",
  "generator": {
    "provider": "google",
    "model": "model-gemini-yang-benar-benar-digunakan",
    "promptVersion": "source-pack-translator.v1"
  },
  "documents": [
    {
      "id": "source-doc-001",
      "title": "Judul dokumen",
      "originalFilename": "dokumen.pdf",
      "originalMediaType": "application/pdf",
      "originalSha256": "64-karakter-hex",
      "role": "material",
      "unitKind": "page",
      "expectedUnits": 120,
      "markdownPath": "documents/001-dokumen.md",
      "coveragePath": "coverage/source-doc-001.json",
      "markdownSha256": "64-karakter-hex"
    }
  ]
}
```

Nilai `role` yang diizinkan: `material`, `question`, `solution`, `mixed`, `reference`. Nilai `unitKind`: `page`, `slide`, `sheet`, `section`. Gunakan unit alami dokumen. `expectedUnits` harus berasal dari inspeksi file, bukan tebakan.

Untuk dokumen contoh soal ITB, isi `title` dengan nama event sumber yang paling lengkap dan benar-benar terlihat, misalnya `UTS Matematika I ITB 2024`. Pertahankan kapitalisasi, mata kuliah, jenis event, institusi, dan tahun secara presisi. Jika satu file memuat beberapa event, gunakan judul koleksi yang benar-benar tertulis pada file dan pertahankan nama setiap event pada unit terkait. Jika event sumber tidak dapat ditentukan, jangan mengarang label generik; catat unresolved dan hentikan pack final. Metadata Source Pack hanya mempertahankan identitas sumber. Skill Product tetap wajib memilih `referenceId` dan `sourceLabel` resmi dari Authoring Context Pack.

Urutkan `documents` sesuai urutan input pengguna. Gunakan path relatif dengan `/`; jangan gunakan `..`, path absolut, backslash, symlink, executable, archive bersarang, atau nama file ganda.

### Markdown dokumen

Mulai setiap unit sumber dengan anchor berikut:

```markdown
<!-- source-unit: 1 -->
```

Pertahankan urutan unit. Untuk halaman kosong, tetap tulis anchor lalu:

```markdown
_Halaman kosong pada sumber._
```

Gunakan:

- heading Markdown untuk hierarki yang benar;
- `$...$` untuk matematika inline dan `$$...$$` untuk matematika display;
- tabel GFM jika tabel sederhana;
- tabel HTML hanya jika header bertingkat atau struktur sel tidak dapat direpresentasikan dengan GFM;
- fenced code block dengan bahasa bila diketahui;
- teks asli soal dan pembahasan, dengan ID stabil yang dapat dirujuk kembali.

Representasikan visual informatif dengan bentuk berikut:

```markdown
:::visual-explanation
id: fig-source-doc-001-u012-01
source-unit: 12
kind: graph
title: Hubungan kecepatan dan waktu
purpose: Menjelaskan perubahan kecepatan terhadap waktu.
elements:
  - Sumbu horizontal berlabel waktu dalam sekon.
  - Sumbu vertikal berlabel kecepatan dalam meter per sekon.
relationships:
  - Garis meningkat linear dari titik A ke titik B.
labels:
  - A berada pada t = 0 dan v = 2.
  - B berada pada t = 4 dan v = 10.
reading-order:
  - Baca sumbu, identifikasi titik, lalu tafsirkan gradien.
instructional-meaning: Gradien garis menyatakan percepatan konstan.
uncertainty: none
:::
```

Untuk foto dekoratif tanpa informasi, tulis blok singkat dengan `kind: decorative` dan alasan. Untuk grafik, catat sumbu, skala, unit, legenda, titik penting, tren, dan hubungan. Untuk diagram, catat komponen, arah panah, urutan proses, label, kondisi, serta makna. Untuk formula berbentuk gambar, transkripsikan sebagai LaTeX dan jelaskan setiap simbol. Untuk geometri, catat bentuk, titik, garis, sudut, ukuran, dan constraint.

Jika suatu bagian benar-benar tidak terbaca, gunakan:

```markdown
[UNRESOLVED source-unit=12 region="kanan bawah" reason="teks terlalu buram"]
```

Pack dengan penanda ini belum final dan tidak boleh berstatus `complete`.

### Coverage ledger

Buat satu `coverage/{document-id}.json` per dokumen:

```json
{
  "documentId": "source-doc-001",
  "status": "complete",
  "expectedUnits": 120,
  "processedUnits": [1, 2, 3],
  "inventory": {
    "headings": 18,
    "formulas": 42,
    "tables": 9,
    "examples": 15,
    "applications": 7,
    "visuals": 24,
    "questions": 80,
    "solutions": 80
  },
  "outputCounts": {
    "headings": 18,
    "formulas": 42,
    "tables": 9,
    "examples": 15,
    "applications": 7,
    "visualExplanations": 24,
    "questions": 80,
    "solutions": 80
  },
  "unresolved": [],
  "reviewPasses": ["inventory", "transcription", "visual", "reconciliation"]
}
```

`processedUnits` harus memuat seluruh bilangan 1 sampai `expectedUnits` tepat satu kali. Inventory adalah hitungan dari inspeksi sumber. Output count adalah hitungan hasil Markdown. Selisih sekecil apa pun harus dijelaskan dan diperbaiki sebelum `complete`.

## Workflow per dokumen

Jangan memproses beberapa dokumen dalam satu prompt besar. Jalankan loop berikut secara terpisah untuk setiap dokumen.

### 1. Inventarisasi

1. Hitung unit sumber secara deterministik.
2. Catat struktur bab, heading, formula, tabel, visual, contoh, penerapan, soal, dan pembahasan per unit.
3. Pisahkan elemen dekoratif dari elemen instruksional, tetapi tetap inventarisasikan keduanya.
4. Buat coverage ledger berstatus `in_progress`.

Jangan mulai transkripsi sebelum inventaris selesai. Inventaris adalah ground truth untuk audit kelengkapan.

### 2. Rencanakan batch

Pilih batch kecil berdasarkan kepadatan, bukan hanya jumlah halaman. Gunakan rentang lebih kecil untuk halaman penuh formula, tabel, atau diagram. Sertakan overlap satu unit saat konteks kalimat atau contoh berlanjut, tetapi deduplikasi hasil saat integrasi.

Catat daftar batch sebelum memanggil Gemini. Jangan meminta Gemini mengerjakan seluruh dokumen panjang sekaligus.

### 3. Transkripsikan batch

Untuk setiap batch:

1. Baca visual halaman, bukan hanya text layer.
2. Transkripsikan konten dalam urutan baca yang benar.
3. Pertahankan istilah, angka, tanda, notasi, dan langkah penyelesaian.
4. Normalisasikan formula ke LaTeX tanpa mengubah makna.
5. Pertahankan identitas soal dan pasangan pembahasannya.
6. Tempatkan anchor unit sebelum isi unit.
7. Catat uncertainty, jangan menebak.

Simpan hasil batch segera. Setelah batch selesai, tandai unit yang diproses dalam ledger. Jangan mengandalkan ingatan percakapan sebagai penyimpanan.

### 4. Jelaskan visual

Lakukan pass khusus visual setelah transkripsi teks. Bandingkan setiap visual dengan inventory. Tulis satu blok `visual-explanation` untuk setiap visual. Pastikan penjelasan memungkinkan agent berikutnya memahami informasi visual tanpa melihat gambar asli.

### 5. Rekonsiliasi lokal

Untuk setiap unit, bandingkan sumber dan Markdown berdampingan:

- jumlah serta isi formula;
- semua angka, unit, label, dan referensi silang;
- baris dan kolom tabel;
- urutan contoh serta langkah;
- jumlah soal dan solusi;
- jumlah visual dan blok eksplanasi;
- paragraf terakhir yang sering terpotong di pergantian batch.

Perbaiki Markdown, lalu ulangi unit yang gagal. Jangan menurunkan standar untuk menyelesaikan pack lebih cepat.

### 6. Rekonsiliasi global

1. Pastikan anchor lengkap dan berurutan.
2. Cocokkan seluruh inventory dengan output counts.
3. Cari heading tanpa isi, formula tidak seimbang, tabel rusak, referensi gambar tanpa blok visual, soal tanpa teks, solusi tanpa pasangan, dan penanda unresolved.
4. Periksa sambungan antarbatch dan deduplikasi overlap.
5. Hitung SHA-256 dari binary asli dan byte Markdown final.
6. Tandai `status: complete` hanya jika semua gate lulus.

### 7. Package

1. Gunakan nama `source-pack-{slug}.zip`.
2. Pastikan `manifest.json` berada di root ZIP.
3. Gunakan UTF-8 dan line ending LF.
4. Urutkan entry secara leksikografis untuk hasil stabil.
5. Buka ZIP hasil akhir dan verifikasi ulang checksum setiap Markdown.
6. Jalankan `bun scripts/validate-source-pack.ts source-pack-{slug}.zip` dari direktori skill atau berikan path script yang ekuivalen.

## Gate berhenti

Jangan menghasilkan ZIP final bila salah satu kondisi berikut terjadi:

- unit sumber hilang atau duplikat;
- ada penanda `[UNRESOLVED ...]`;
- inventory dan output counts berbeda tanpa alasan yang dapat diverifikasi;
- formula tidak lengkap atau delimiter tidak seimbang;
- visual instruksional belum memiliki penjelasan;
- soal atau pembahasan terpotong;
- checksum tidak cocok;
- nama event sumber soal dibutuhkan tetapi ambigu, terpotong, atau hasil tebakan;
- agent hanya memiliki hasil OCR tetapi tidak dapat memeriksa halaman visual.

Laporkan dokumen, unit, region, dan tindakan yang dibutuhkan. Kualitas dan kelengkapan lebih penting daripada menghasilkan ZIP.

## Handoff

Serahkan:

1. path `source-pack-{slug}.zip`;
2. jumlah dokumen dan unit;
3. tabel ringkas inventory dan output count per dokumen;
4. checksum ZIP;
5. pernyataan eksplisit bahwa pack siap diupload ke tab `Siapkan pekerjaan` pada halaman admin Authoring eksternal, atau daftar blocker jika belum siap.

Admin kemudian memilih mata kuliah, bab, pemetaan section, dan produk di website untuk mengunduh Authoring Job Pack. Hanya Authoring Job Pack tersebut yang menjadi input awal `$zyx-idea-authoring`.

Source Pack tidak menetapkan `itbSource`, `itbCuration`, origin bank soal, atau status publikasi. Metadata tersebut baru dibuat oleh `$zyx-product-authoring` dari allowed ITB reference resmi dalam Authoring Context Pack.

Jangan melanjutkan ke authoring Idea atau Product dalam turn yang sama kecuali pengguna secara eksplisit meminta menjalankan skill kedua dan sudah memberikan Authoring Job Pack dari website.
