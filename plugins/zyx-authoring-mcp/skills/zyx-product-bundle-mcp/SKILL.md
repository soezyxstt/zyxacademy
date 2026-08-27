---
name: zyx-product-bundle-mcp
description: Menghasilkan Product Bundle V2 draft dari Source Pack dan Idea yang telah dipublikasikan, dengan Artikel, Diktat, flashcard, contoh soal ITB, solusi, blueprint, dependency, provenance, dan quality gate MCP. Gunakan saat membuat Product Bundle. Jangan gunakan untuk membuat Source Pack atau Idea Bundle.
---

# Zyx Product Bundle MCP

Gunakan skill ini sebagai instruction layer untuk MCP. MCP adalah enforcement layer untuk schema, checksum, provenance, dependency, chapter scope, published Idea, Article compiler, dan content quality. Baca [references/workflow.md](references/workflow.md) sebelum mulai.

## Prasyarat

1. Source Pack harus sudah diterima `source.ingest` dengan `valid: true`.
2. Idea Bundle harus sudah dikirim melalui `authoring.submit_idea_bundle`, direview, dan dipublikasikan admin.
3. Gunakan `workflow.get_contract` dari run `idea_product`. Jangan meminta operator mengetik course ID, chapter ID, Idea ID, atau semantic hash.
4. Gunakan hanya Idea versi dan source excerpt yang masih aktif serta sama dengan context yang terkunci.

## Workflow authoring

1. Kunci course, chapter, Source Pack checksum, Idea version, semantic hash, source references, dan allowed ITB reference.
2. Tulis Artikel terlebih dahulu sebagai single source of truth. Untuk setiap Idea, tutup prerequisite, pertanyaan inti, intuisi, definisi, notasi, visual, prosedur, worked example, miskonsepsi, use case, dan retrieval prompt.
3. Turunkan Diktat hanya dari Artikel yang lengkap. Pertahankan lineage Artikel, semua Idea, formula, source trace, contoh, visual bermakna, jebakan, dan retrieval prompt.
4. Buat flashcard atomic dan masukkan ke flashcard set.
5. Untuk question Product, salin hanya soal ITB yang benar-benar ada pada Source Pack. Gunakan `itbSource.referenceId` dan event label exact dari allowed context. Jangan membuat soal original Zyx, mengubah angka, atau mengganti benchmark ID dengan reference ID.
6. Buat solusi terpisah untuk setiap question dan blueprint hanya untuk question dalam bundle.
7. Package hanya `manifest.json`, `entities/products.json`, dan `entities/dependencies.json`. Semua entry harus mode `0644`; jangan masukkan script, state, laporan, binary, symlink, archive bersarang, atau file tambahan.
8. Panggil `authoring.validate_product_bundle`. Periksa technical issues, publication blocking dependency, published Idea scope, chapter scope, Article quality, Diktat quality, depth, examples, analogies, visuals, retrievals, traps, formulas, dan Idea coverage.
9. Revisi dan validasi ulang sampai `valid: true` tanpa issue blocking. Panggil `authoring.submit_product_bundle` hanya setelah itu. MCP menyimpan draft untuk review dan tidak dapat publish.

## Siklus hidup dan pemeliharaan

- **Inspeksi import**: Gunakan `authoring.list_imports { bundleType: "product" }` dan `authoring.get_import { bundleType: "product", importId }` untuk membaca inventory dan keputusan review tanpa mengekspos storage key atau ID internal reviewer.
- **Restage**: Jika draft Product Bundle perlu diganti, panggil `authoring.restage_product_bundle` dengan `importId`, `filename`, dan `bundleBase64`. Staging ulang memvalidasi ulang bundle dengan bundle ID dan scope yang sama (`authoring:stage`).
- **Discard draft**: Panggil `authoring.discard_product_draft` dengan `importId` untuk menghapus draft Product Bundle beserta artifact staging-nya secara permanen (`authoring:withdraw`). Tindakan ini destruktif dan hanya berlaku untuk bundle berstatus draft; bundle published atau withdrawn tidak dapat dihapus.
- **Review**: `authoring.review_product_bundle` mencatat keputusan review immutable (`approved` atau `rejected`) dengan catatan review (`authoring:review`). Jalankan hanya setelah ada instruksi eksplisit untuk keputusan tersebut.
- **Withdrawal**: Panggil `authoring.withdraw_product_bundle` dengan `importId` untuk menarik Product Bundle yang sudah published (`authoring:withdraw`). Tindakan ini audited, idempotent, dan destruktif (meretire projection canonical dan mengantrekan penghapusan vector).
- **Stop condition**: MCP tidak memiliki tool publikasi (`authoring:publish` tidak ada). Restage, keputusan review, discard draft, dan withdraw tidak boleh dijalankan secara otonom tanpa instruksi eksplisit. Publikasi tetap dilakukan melalui alur review admin Zyx.

## Ambang konten

Article harus memenuhi kedalaman minimum per Idea, explicit attribution pada multi-Idea block, worked example, analogy, visual, retrieval prompt, dan strict Article compiler. Diktat harus memiliki Idea set yang sama dengan Artikel, kata minimum, section, contoh, visual, trap, retrieval, dan formula inventory yang memadai. Ambang aktual berasal dari `quality.metrics` MCP, bukan perkiraan agent.

## Aturan keamanan dan provenance

Jangan mengubah checksum manifest setelah mengubah isi. Jangan memasukkan `HOLDOUT_CANARY`, correct-answer snapshot runtime, atau marker internal ke Product Bundle. Semua question harus memiliki satu solution, ITB source, dan ITB curation yang memuat reference tersebut. Product Bundle berstatus draft; hanya admin yang dapat review, edit, publish, atau withdraw.

## Selesai

Laporkan bundle ID, checksum, jumlah produk per jenis, dependency status, quality report, dan hasil staging. Berhenti bila Idea belum published, context stale, dependency perlu review, atau MCP mengembalikan issue blocking. Jangan mengklaim tindakan publikasi otomatis.
