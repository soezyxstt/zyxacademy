---
name: zyx-product-authoring
description: Membuat Product Bundle V2 berstatus draft dari tepat satu Authoring Job Pack dan satu Authoring Context Pack terbaru yang berisi Idea resmi Zyx. Gunakan untuk Artikel lengkap, Diktat turunan, flashcard, penyalinan contoh soal ITB beserta sitasi event, solusi, assessment blueprint, dependency, dan packaging deterministik. Product Bundle tidak pernah memuat soal asli Zyx. Jangan gunakan untuk menerjemahkan sumber atau membuat Idea Bundle.
---

# Zyx Product Authoring

## Hasil tunggal

Hasilkan `product-bundle-{name}.zip`, `product-quality-report.json`, dan `product-coverage-report.json`.

Semua produk memakai `status: draft`. Website menangani lifecycle sederhana `draft -> published -> withdrawn`. Jangan menerbitkan atau menarik produk dari agent.

## Input

Terima tepat dua ZIP:

1. `authoring-job-{name}.zip`, sebagai sumber lengkap dan scope produk yang dipilih admin.
2. `authoring-context-{name}.zip`, diekspor setelah Idea Bundle diedit dan dipublikasikan di website.

Jangan meminta admin mengetik ID teknis. Sebelum bekerja:

1. Baca [references/input-and-contract.md](references/input-and-contract.md).
2. Baca [references/article-method.md](references/article-method.md).
3. Baca [references/product-methods.md](references/product-methods.md).
4. Baca [references/quality-gates.md](references/quality-gates.md).
5. Baca dan terapkan lesson aktif dalam `assets/authoring-learning-profile.json`.
6. Jalankan `bun scripts/validate-authoring-job.ts <authoring-job.zip>`.
7. Jalankan `bun scripts/validate-authoring-context.ts <authoring-context.zip>`.
8. Pastikan context pack berasal dari course dan chapter yang sama, memuat Idea published, source excerpt resmi, schema terbaru, dan pilihan produk yang konsisten.

Jika kedua pack tidak cocok atau context pack sudah stale, berhenti dan minta export baru. Jangan menebak ID, hash, excerpt, atau benchmark reference.

## Workspace

Gunakan workspace persisten:

```text
product-work/{job-id}/
  state.json
  inputs/
  article/
  diktat/
  flashcards/
  questions/
  solutions/
  blueprint/
  reports/
  bundle/
```

Mulai dari `assets/state.template.json`. Simpan checksum input, family aktif, batch selesai, issue, dan gate. Riwayat chat bukan state kerja.

## Workflow wajib

### 1. Kunci scope

- Cocokkan job, course, chapter, section mapping, Source Pack checksum, Idea identity, version, dan semantic hash.
- Kerjakan hanya keluarga produk yang dipilih admin.
- Buat ledger Idea, source excerpt, objective, requirement, relation, dan allowed ITB reference.
- Bedakan `benchmark.id` dari `benchmark.referenceId`. Hanya `referenceId` yang boleh masuk `itbSource` dan `itbCuration`.
- Untuk setiap soal, temukan stem dan opsi asli dalam Source Pack, cocokkan nama event sumber dengan `sourceLabel` exact pada allowed reference, lalu transkripsikan tanpa parafrasa, perubahan angka, atau adaptasi substansi.
- Salin `referenceId` ke `itbSource.referenceId` dan `sourceLabel` ke `itbSource.eventName`. Product Bundle tidak pernah membuat soal asli Zyx.
- Tandai semua kebutuhan sebagai `gap` sebelum produksi.

### 2. Artikel terlebih dahulu

Artikel adalah satu-satunya bahan ajar utama. Mahasiswa harus dapat mempelajari seluruh scope tanpa membuka Source Pack, Diktat, flashcard, solusi, atau chat tutor.

Buat `article-plan.json` dari template. Bagi Artikel menjadi part berdasarkan penutupan konsep, bukan panjang seragam. Untuk setiap part:

1. Muat hanya Idea, source excerpt, prerequisite, dan janji global yang relevan.
2. Tulis part lengkap.
3. Audit struktur, sumber, formula, contoh, penerapan, asumsi, miskonsepsi, dan transisi.
4. Revisi item gagal saja.
5. Audit ulang dengan konteks segar.

Setelah semua part lulus, integrasikan dan lakukan fresh student read. Jika produk lain membutuhkan fakta yang belum diajarkan, perbaiki Artikel terlebih dahulu.

### 3. Produk turunan secara berurutan

Kerjakan satu family per loop. Urutan default:

1. Diktat dari Artikel yang sudah lulus.
2. Flashcard.
3. Contoh soal ITB dari Source Pack.
4. Solusi dalam pass terpisah dari pembuat soal.
5. Assessment blueprint.

Untuk setiap family: plan, generate batch kecil, validate schema, audit pedagogis, revisi kegagalan, audit ulang, merge, lalu audit coverage global. Jangan berpindah family ketika masih ada issue blocking.

### 4. Traceability dan dependency

- Setiap produk memiliki Idea link resmi dan source reference resmi.
- Bobot Idea per produk positif dan berjumlah 1.
- Setiap soal memiliki tepat satu solusi.
- Setiap soal memiliki `itbSource.referenceId` dan `itbSource.eventName`; reference tersebut wajib muncul dalam `itbCuration`.
- `itbSource.referenceId` berasal dari field `referenceId`, bukan benchmark `id`, dataset key, atau checksum.
- Prompt dan opsi soal mempertahankan isi sumber ITB. Normalisasi hanya boleh memperbaiki encoding, whitespace, dan notasi render tanpa mengubah makna.
- Setiap flashcard berada dalam set.
- Diktat memiliki lineage dan dependency exact ke Artikel.
- Blueprint hanya menunjuk soal dalam bundle.
- Refresh generation hash dan dependency hash setelah setiap edit.

### 5. Package dan validasi

Buat ZIP:

```text
manifest.json
entities/products.json
entities/dependencies.json
```

Gunakan `$UPLOADER` dan `$APPROVING_REVIEWER`. Gunakan serialization dan SHA-256 deterministik. Jalankan:

```bash
bun scripts/validate-product-bundle.ts bundle/product-bundle.zip
```

Jangan menyerahkan bundle jika validator, compiler Artikel, dependency check, atau quality gate gagal.

Validator ZIP tidak membuktikan bahwa ITB reference masih allowed atau event label masih cocok dengan database. Karena itu quality report wajib merekam exact match Source Pack ke `sourceLabel`, dan admin publication tetap menjadi gate otoritatif terakhir.

## Authoring Learning Profile

Saat operator memberi koreksi eksplisit terhadap gaya atau kualitas produk:

1. Terapkan koreksi pada artefak saat ini.
2. Perbarui `assets/authoring-learning-profile.json` dalam turn yang sama.
3. Tambahkan lesson ringkas berisi scope, rule, problem, preferred pattern, dan tanggal.
4. Jangan belajar dari isi materi, dugaan agent, atau error teknis.
5. Lesson tidak boleh mengganti schema, sumber resmi, atau quality gate.
6. Jika lesson baru bertentangan dengan lesson lama, tandai lesson lama `superseded`; jangan hapus sejarah.

Tidak ada Revision Pack dan tidak ada langkah training terpisah. Profil lokal ini otomatis dibaca pada run berikutnya.

## Selesai

Serahkan path ZIP, checksum, jumlah per jenis produk, coverage Idea dan sumber, hasil validator, dan nol issue terbuka. Beri tahu admin bahwa upload menghasilkan draft yang dapat dipreview, diedit, dipublikasikan, atau dihapus. Produk published dapat ditarik menjadi withdrawn.
