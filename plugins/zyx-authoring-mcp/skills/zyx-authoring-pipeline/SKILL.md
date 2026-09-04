---
name: zyx-authoring-pipeline
description: Mengorkestrasi workflow Zyx dari dokumen asli menjadi Source Pack tervalidasi, Idea Bundle V3 staged, lalu Product Bundle V3 tervalidasi atau staged. Gunakan ketika operator meminta alur lengkap atau ingin melanjutkan pipeline dari checkpoint. Jangan gunakan untuk satu tahap saja atau workflow bank soal.
---

# Zyx Authoring Pipeline

Gunakan skill ini sebagai orchestration layer untuk workflow `idea_product`. Skill ini tidak menggantikan aturan tahap, schema, validator, atau quality gate. MCP tetap menjadi sumber kebenaran runtime.

Sebelum menjalankan suatu tahap, baca dan ikuti skill tahap tersebut beserta reference yang diwajibkannya. Skill pipeline hanya mengatur transisi dan checkpoint:

- Source Pack: [zyx-source-pack-mcp](../zyx-source-pack-mcp/SKILL.md)
- Idea Bundle: [zyx-idea-bundle-mcp](../zyx-idea-bundle-mcp/SKILL.md)
- Product Bundle: [zyx-product-bundle-mcp](../zyx-product-bundle-mcp/SKILL.md)

Baca [references/workflow.md](references/workflow.md) sebelum memulai atau melanjutkan pipeline.

## Tujuan dan otorisasi

Satu prompt dapat menetapkan tujuan akhir pipeline, tetapi tidak menghapus checkpoint, quality gate, atau kewenangan admin. Secara default, permintaan membuat pipeline mengizinkan pembuatan artifact dan validasi read-only. Panggil tool submission yang membutuhkan `authoring:stage` hanya jika operator telah meminta submit/staging secara eksplisit dalam prompt atau mengonfirmasinya sebelum pemanggilan.

MCP tidak memiliki publication tool. Jangan menyatakan Idea atau Product sudah published berdasarkan keberhasilan submission. Publication tetap dilakukan admin melalui dashboard Zyx.

## Input awal

Kumpulkan hanya input yang belum tersedia. Jika prompt sudah menyebut course dan chapter tanpa attachment, cari PDF tersimpan melalui katalog MCP sebelum meminta file lokal.

- target course dan chapter dalam bahasa manusia;
- dokumen tersimpan yang relevan, atau path absolut dan urutan file lokal sebagai compatibility path;
- target akhir `product_validated` atau `product_staged`; default `product_validated` bila staging tidak diminta eksplisit;
- preferensi Product yang benar-benar diperlukan, termasuk pemilihan soal ITB bila ada kandidat.

Gunakan pilihan opaque dari MCP untuk mengunci course dan chapter. Jangan meminta atau menebak ID teknis. Jika hanya ada satu exact match dari prompt, lanjutkan dengan scope itu dan laporkan labelnya. Minta konfirmasi hanya bila hasil ambigu, near-match, atau pilihan akan mengubah scope yang sebelumnya terkunci.

## Orkestrasi

1. Tentukan apakah pipeline baru atau resume dari checkpoint.
2. Jalankan tahap Source Pack dengan `$zyx-source-pack-mcp` sampai `source.ingest` menghasilkan `valid: true`. Jika resume dari checkpoint atau Source Pack sudah pernah di-ingest sebelumnya, periksa `source.list_packs` untuk menggunakan Source Pack yang tersimpan di R2 dan database tanpa perlu transkripsi ulang. Untuk prompt-only baru, gunakan `catalog.list_courses`, `catalog.list_chapters`, `source.list_files`, `source.read_file`, dan `storedOriginals`; file lokal tetap didukung melalui `originals`.
3. Kunci workflow `idea_product`, course, dan chapter; ambil run serta contract aktif.
4. Jalankan tahap Idea dengan `$zyx-idea-bundle-mcp` sampai valid. Submit hanya jika diotorisasi.
5. Setelah Idea staged, berhenti pada `WAITING_IDEA_PUBLICATION`. Laporkan checkpoint dan jangan mulai Product berdasarkan Idea draft.
6. Saat operator meminta resume setelah publikasi, verifikasi ulang run, contract, Idea published, source excerpt aktif, versi, semantic hash, dan dependency freshness melalui MCP.
7. Jalankan tahap Product dengan `$zyx-product-bundle-mcp` sampai valid. Wajib lulus MCP quality gate per section dan learner-facing editorial preflight, termasuk zero internal-ID leaks, topic 3 sampai 8 menit, hard limit 1.500 kata, serta perbedaan Artikel terstruktur dan Diktat review. Submit hanya jika diotorisasi.
8. Laporkan hasil terpadu dan status akhir tanpa mengklaim publication yang tidak dilakukan MCP.

Validation loop boleh berjalan tanpa meminta keputusan untuk perbaikan mekanis yang langsung ditentukan oleh `issues` dan `quality.metrics`. Berhenti dan diskusikan bila sumber ambigu, pemetaan scope tidak pasti, pemecahan Idea substantif, warning membutuhkan judgment, kandidat soal ITB harus dipilih, context stale, atau dependency publication-blocking.

## Checkpoint dan resume

Gunakan status yang didefinisikan dalam reference. Pada setiap jeda, laporkan minimal:

- status dan tahap terakhir yang selesai;
- label course dan chapter terkunci;
- nama atau path bila ada, serta checksum artifact yang sudah dibuat;
- bundle ID, checksum, quality result, dan staging result yang tersedia;
- blocker atau keputusan yang dibutuhkan;
- kondisi objektif untuk melanjutkan dan instruksi resume singkat.

Checkpoint tidak boleh dimasukkan ke ZIP Source Pack, Idea Bundle, atau Product Bundle. Jangan menulis connection token, access token, atau credential ke artifact, laporan, source code, atau Git. Pertahankan token workflow hanya pada konteks runtime yang aman; bila token atau contract tidak lagi valid, ambil context baru dan validasi ulang tahap yang bergantung padanya.

## Batas scope

- Jangan menyalin aturan rinci tiga skill tahap ke skill ini.
- Jangan menjalankan `$zyx-question-authoring-mcp` sebagai bagian otomatis pipeline. Tawarkan sebagai workflow `quiz_bank` terpisah setelah Idea published bila relevan.
- Jangan melewati review admin, mengarang status publication, atau menganggap submission sama dengan publication.
- Jangan melanjutkan ke tahap berikutnya bila entry gate tahap tersebut belum terpenuhi.

## Selesai

Pipeline selesai pada `PRODUCT_VALIDATED` untuk target `product_validated`, atau `PRODUCT_STAGED` untuk target `product_staged`. Kedua target tetap memerlukan Idea staged dan published sebagai prasyarat Product. Setelah selesai, jelaskan bahwa Product belum published dan, bila staged, masih menunggu review/publication admin.
