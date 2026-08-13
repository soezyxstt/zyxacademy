---
name: zyx-idea-authoring
description: Mengubah tepat satu Authoring Job Pack dari website Zyx menjadi Idea Bundle V2 yang lengkap, atomik, source-grounded, terkurasi, dan siap melalui preview serta staging website. Gunakan untuk discovery Idea, source material, exact source chunks, provenance, relasi, coverage audit, perbaikan gap, dan packaging deterministik. Berhenti setelah Idea Bundle valid; jangan membuat Artikel, soal, atau Product Bundle.
---

# Zyx Idea Authoring

## Hasil tunggal

Hasilkan:

```text
idea-bundle-{name}.zip
idea-quality-report.json
idea-coverage-report.json
```

Jangan membuat Product Bundle. Setelah ZIP diupload, admin melakukan preview, mengedit field yang diizinkan, menyimpan staging, menjalankan review dan approval, lalu memublikasikan Idea di Zyx. Product dibuat oleh `$zyx-product-authoring` hanya setelah tersedia Authoring Context Pack baru yang diekspor sesudah publikasi.

## Input

Terima tepat satu `authoring-job-{name}.zip` dari halaman admin Zyx. Jangan meminta admin mengetik course ID, chapter ID, creator ID, snapshot ID, atau run ID.

Sebelum bekerja:

1. Baca penuh [references/input-and-contract.md](references/input-and-contract.md).
2. Baca penuh [references/idea-method.md](references/idea-method.md).
3. Baca penuh [references/quality-gates.md](references/quality-gates.md).
4. Baca `assets/authoring-learning-profile.json` dan terapkan lesson aktif yang relevan.
5. Jalankan `bun scripts/validate-authoring-job.ts <pack.zip>`.

Tolak pack yang tidak valid. Jangan memperbaiki Source Pack secara diam-diam.

## Workspace

Gunakan workspace persisten:

```text
idea-work/{job-id}/
  state.json
  inputs/
  source-map/
  candidates/
  ideas/
  reports/
  bundle/
```

Simpan checksum, task selesai, issue, dan keputusan di `state.json`. Jangan memakai riwayat percakapan sebagai satu-satunya state.

## Workflow wajib

### 1. Validasi dan petakan sumber

- Ekstrak Authoring Job Pack dengan aman tanpa mengubah byte.
- Kunci job ID, course, chapter, dan section mapping.
- Inventarisasi setiap source unit, formula, definisi, prinsip, prosedur, contoh, penerapan, constraint, miskonsepsi, visual explanation, soal, dan solusi.
- Pertahankan `title` source material persis dari manifest Source Pack. Untuk dokumen contoh soal ITB, jangan mengganti nama event dengan label generik.
- Buat coverage ledger awal dengan semua unit berstatus `gap` atau `unassigned`.
- Jangan memindahkan section ke chapter lain.

### 2. Discover dalam batch kecil

Kerjakan satu kelompok source unit per subtask:

1. Temukan kandidat makna akademik.
2. Simpan exact source evidence.
3. Jangan menetapkan final ID sebelum normalisasi.
4. Jangan menggunakan pengetahuan model untuk menambah klaim sumber.

### 3. Normalize dan trace

- Pecah kandidat yang memuat klaim independen.
- Gabungkan duplikat semantik tanpa membuang provenance.
- Tulis satu canonical statement yang presisi.
- Buat source material dan source chunk dari byte Markdown resmi.
- Pastikan offset exact dan checksum cocok.
- Gunakan `sourcePolicy: source_grounded` untuk seluruh Idea yang dibuat oleh workflow ini.
- Beri setiap Idea minimal satu provenance primer.
- Gunakan soal dan solusi sumber sebagai bukti konsep, contoh, prosedur, atau assessment support. Jangan menjadikan stem soal sebagai Idea hanya karena stem tersebut ada, dan jangan membuat produk soal pada tahap ini.

### 4. Curate dalam pass terpisah

Audit tanpa mengandalkan penilaian creator:

- atomisitas;
- kebenaran dan kondisi;
- granularitas;
- jenis pengetahuan;
- instructional role;
- formula dan unit;
- nilai mengajar dan mengukur;
- duplikasi;
- dukungan sumber.

Creator memperbaiki issue, lalu curator menguji ulang. Jangan menggabungkan penemuan, penilaian, dan packaging dalam satu pass besar.

### 5. Relasi dan coverage

- Buat hanya relasi yang bermakna: prerequisite, related, extends, example_of, misconception_of.
- Tolak self relation, duplikat, endpoint hilang, dan siklus prerequisite.
- Jalankan forward coverage dari seluruh source unit ke Idea atau exclusion.
- Jalankan reverse coverage dari seluruh Idea ke bukti primer.
- Berhenti hanya ketika gap bermakna nol dan seluruh exclusion memiliki alasan.

### 6. Package dan validasi

Buat ZIP:

```text
manifest.json
sources/*.md
entities/source-materials.json
entities/source-chunks.json
entities/ideas.json
entities/provenance.json
entities/relations.json
```

Gunakan `$UPLOADER` dan `$APPROVING_REVIEWER`. Gunakan serialization dan SHA-256 deterministik. Jalankan:

```bash
bun scripts/validate-idea-bundle.ts bundle/idea-bundle.zip
```

Jangan menyerahkan bundle jika validator atau quality gate gagal.

Field `status: published` pada entity Idea berarti publication-ready sesuai kontrak bundle, bukan berarti agent telah memublikasikannya. Status import website tetap dikendalikan oleh alur preview, staging, review, approval, dan publication.

## Authoring Learning Profile

Saat operator memberi koreksi eksplisit terhadap hasil Idea:

1. Terapkan koreksi pada artefak saat ini.
2. Perbarui `assets/authoring-learning-profile.json` dalam turn yang sama.
3. Tambahkan satu lesson ringkas dengan scope, rule, problem, preferred pattern, dan tanggal.
4. Jangan membuat lesson dari isi dokumen, dugaan agent, atau kegagalan teknis.
5. Jangan membiarkan lesson mengganti schema, kebenaran sumber, atau quality gate.
6. Jika lesson baru bertentangan dengan lesson lama, tandai lesson lama `superseded`; jangan menghapus sejarah.

Tidak perlu meminta langkah training terpisah. Profil dibaca otomatis pada run berikutnya.

## Selesai

Serahkan path ZIP, checksum, jumlah source, chunk, Idea, provenance, relasi, coverage, hasil validator, dan nol issue terbuka. Instruksikan admin untuk upload, edit, lalu publish Idea sebelum menjalankan skill Product.
