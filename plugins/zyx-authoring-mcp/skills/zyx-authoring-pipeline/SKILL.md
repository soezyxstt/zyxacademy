---
name: zyx-authoring-pipeline
description: Mengorkestrasi workflow `idea_product` dari Source Pack lossless ke Idea Bundle V3 lalu Product Bundle V3 learning-only. Product V3 hanya berisi Artikel, Diktat, dan flashcard; asesmen memakai workflow terpisah. Gunakan untuk alur lengkap atau resume checkpoint.
---

# Zyx Authoring Pipeline

Skill ini hanya mengatur transisi/checkpoint. Ia tidak menggantikan aturan tahap, reference, schema, validator, atau author preflight.

Sebelum menjalankan setiap tahap, baca skill tahap dan semua reference yang diwajibkannya:

- Source Pack: [zyx-source-pack-mcp](../zyx-source-pack-mcp/SKILL.md)
- Idea Bundle: [zyx-idea-bundle-mcp](../zyx-idea-bundle-mcp/SKILL.md)
- Product Bundle: [zyx-product-bundle-mcp](../zyx-product-bundle-mcp/SKILL.md)
- Soal original Zyx: [zyx-question-authoring-mcp](../zyx-question-authoring-mcp/SKILL.md), workflow terpisah
- Historical reference: [reference-question-ingest](../reference-question-ingest/SKILL.md), workflow course-only terpisah

Baca [references/workflow.md](references/workflow.md) sebelum mulai/resume.

## Invariant lintas tahap

1. Source Pack harus lossless; jangan meringkas atau menebak sumber.
2. Idea harus source-grounded dan lulus split/merge preflight.
3. Artikel Product V3 adalah satu-satunya bacaan utama mahasiswa untuk belajar bab.
4. Diktat hanya review setelah Artikel dan tidak menambah fakta baru.
5. Flashcard hanya recall atas hal yang sudah diajarkan Artikel.
6. Product Bundle V3 tidak memuat question/solution/assessment blueprint.
7. Soal original dan historical reference tidak boleh dijalankan otomatis sebagai bagian pipeline `idea_product`.
8. MCP validation dan author preflight adalah gate terpisah; keduanya wajib lulus sesuai tahap.

Jika reference lama atau artifact legacy bertentangan dengan batas Product V3, jangan meniru legacy untuk authoring baru.

## Keputusan awal yang tidak boleh ditebak

Artikel adalah satu-satunya source of truth bacaan mahasiswa; Source Pack/Idea tetap bukti internal, bukan bacaan alternatif. Gunakan matriks ketuntasan dan turunan pada skill Product sebagai bukti exit gate, bukan pernyataan “konten sudah baik”.

Kunci scope dan target dari percakapan. Jika operator sudah meminta staging pipeline dalam scope itu, otorisasi mencakup submit Idea dan Product yang diperlukan; jangan bertanya ulang pada setiap checkpoint. Tetap berhenti untuk publication Idea oleh admin karena MCP tidak menyediakan publish. Jika hanya validasi diminta, hasil sementara berhenti pada `IDEA_VALIDATED` sampai prerequisite publication tersedia.

Reuse Source Pack atau published Idea yang memenuhi scope dan checksum. Jangan menghasilkan Idea duplikat hanya agar mengikuti urutan tahap pada pipeline baru. Jika hanya satu tahap diminta, gunakan skill tahap itu dan selesaikan hasil yang diminta tanpa memperluas ke pipeline.

Catatan rencana/checkpoint bukan entity payload dan berada di luar ZIP. Jangan simpan credential, run token, sourcePackToken, fileKey, atau connection token dalam laporan/checkpoint; simpan identitas/checksum non-secret dan ambil token fresh saat resume.

## Otorisasi

Satu prompt dapat menetapkan tujuan akhir, tetapi tidak menghapus checkpoint, quality gate, atau kewenangan admin. Secara default, permintaan membuat pipeline mengizinkan artifact creation dan read-only validation.

Panggil tool submission/staging hanya bila operator meminta atau mengonfirmasi staging secara eksplisit. Review, restage yang mengubah state, discard, withdraw, dan tindakan destruktif lain mengikuti aturan skill tahap dan tidak boleh dijalankan otomatis.

MCP tidak menyediakan publish. Jangan menyatakan submit/review = published.

## Input awal

Kumpulkan hanya yang belum tersedia:

- course dan chapter dalam bahasa manusia;
- stored document yang relevan atau file lokal bila memang diberikan;
- target akhir `product_validated` atau `product_staged` (default `product_validated` jika staging tidak diminta);
- preferensi pedagogi yang benar-benar mengubah konten Product.

**Jangan meminta pemilihan soal ITB untuk Product V3.** Asesmen bukan bagian Product V3.

Gunakan opaque choices MCP untuk scope; jangan meminta/menebak ID teknis. Konfirmasi hanya jika kandidat ambigu/near-match atau akan mengubah scope terkunci.

## Orkestrasi

1. Tentukan pipeline baru atau resume.
2. Jalankan `$zyx-source-pack-mcp` sampai Source Pack `valid: true`; reuse stored pack bila checksum/scope cocok.
3. Kunci run `idea_product`, course/chapter, Source Pack, dan contract aktif.
4. Jalankan `$zyx-idea-bundle-mcp` sampai **author decomposition preflight + MCP validation** lulus.
5. Submit Idea hanya bila diotorisasi.
6. Setelah Idea staged dan belum published, berhenti pada `WAITING_IDEA_PUBLICATION`. Jika published Idea yang sesuai sudah terverifikasi, langsung lanjutkan gate Product tanpa membuat/submit ulang Idea. Product tidak boleh dibuat dari Idea draft/unpublished.
7. Saat resume, verifikasi checkpoint: artifact checksum, run ID, contract checksum, scope, Source Pack checksum, published Idea versions/hashes, source excerpt, dan dependency freshness. Jangan mengandalkan ingatan sesi.
8. Jalankan `$zyx-product-bundle-mcp`. Wajib membuat Artikel lebih dulu sampai self-contained, baru menurunkan Diktat dan flashcard. Luluskan Product author preflight + flashcard preflight + MCP validation.
9. Submit Product hanya bila diotorisasi.
10. Laporkan hasil tanpa mengklaim publication.

Validation loop boleh memperbaiki issue mekanis yang jelas dari validator. Ulangi author preflight setelah revisi substantif; jangan hanya mengoptimalkan agar validator hijau.

## Checkpoint dan resume

Setiap jeda laporkan minimal:

- state dan tahap terakhir selesai;
- course/chapter label;
- run ID, contract checksum, Source Pack checksum;
- artifact path/name/checksum/bundle ID jika tersedia;
- hasil author preflight dan MCP validation secara terpisah;
- staging status;
- blocker/keputusan yang dibutuhkan;
- kondisi objektif untuk resume.

Jangan menulis credential/token ke artifact, report, source code, atau Git.

## Batas scope

- Jangan menyalin aturan rinci tahap ke pipeline; selalu delegasikan ke skill tahap.
- Jangan menjalankan `$zyx-question-authoring-mcp` otomatis setelah Product. Tawarkan hanya sebagai workflow terpisah bila operator meminta bank soal.
- Jangan menjalankan `$reference-question-ingest` otomatis. Workflow itu course-only dan tidak memakai Source Pack/chapter scope pipeline ini.
- Jangan melewati admin review/publication boundary.
- Jangan lanjut ke tahap berikutnya bila entry gate belum terpenuhi.

## Stop conditions

Masuk `NEEDS_OPERATOR_DECISION`, `BLOCKED_BY_VALIDATION`, atau `STALE_CONTEXT` bila:

- urutan/mapping source ambigu;
- course/chapter ambigu;
- source reconciliation belum tuntas;
- pemecahan/relation Idea butuh judgment substantif;
- warning near-duplicate/formula trace tetap belum terselesaikan setelah dibandingkan dengan bukti;
- Product tidak dapat dibuat self-contained dari evidence;
- Idea belum terbukti published;
- submission belum diotorisasi;
- context/dependency stale;
- issue blocking berulang tidak dapat diperbaiki secara mekanis.

## Selesai

Pipeline selesai pada `PRODUCT_VALIDATED` untuk target validasi atau `PRODUCT_STAGED` untuk target staging. Kedua hasil tetap memerlukan published Idea sebagai prasyarat Product. Laporkan bahwa MCP green bukan admin pedagogic review, bukan bukti PDF Diktat, dan bukan publication readiness.
