---
name: zyx-product-bundle-mcp
description: Menghasilkan Product Bundle V3 draft dengan Artikel terstruktur per subtopik, Diktat review, dan produk belajar lain yang siap dibaca mahasiswa tanpa kebocoran ID internal. Gunakan saat membuat Product Bundle dari Source Pack dan Idea published. Jangan gunakan untuk membuat Source Pack atau Idea Bundle.
---

# Zyx Product Bundle MCP

Gunakan skill ini sebagai instruction layer untuk MCP. MCP adalah enforcement layer untuk schema, checksum, provenance, dependency, chapter scope, published Idea, Article compiler, dan content quality. Sebelum menulis, wajib baca [references/workflow.md](references/workflow.md) dan [references/editorial-guide.md](references/editorial-guide.md). Laporan MCP hijau belum membuktikan bahwa materi nyaman dibaca mahasiswa; gate editorial pada skill ini juga wajib lulus.

## Hasil yang wajib dicapai

- **Artikel** adalah dokumen terstruktur per subtopik. Chapter memiliki overview, topic yang mengikuti learning section, summary, dan pemeriksaan akhir. Setiap topic dapat dibaca dalam satu layar reader tanpa kehilangan konteks bab.
- **Diktat** adalah bahan review cepat, bukan Artikel kedua. Targetkan 2 sampai 4 halaman render, sekitar 1.200 sampai 1.600 kata Bahasa Indonesia yang padat, berisi intisari konsep, formula, prosedur, contoh kilat, jebakan, dan cek ingatan.
- Semua teks yang dilihat mahasiswa memakai nama konsep manusiawi seperti `Kinematika Benda Tegar`. ID seperti `IDEA-001` hanya boleh berada pada field metadata, provenance, dependency, dan atribusi block yang tidak dirender.

## Prasyarat

1. Source Pack harus sudah diterima `source.ingest` dengan `valid: true`. Jika pekerjaan dimulai hanya dari prompt mata kuliah dan bab, jalankan `$zyx-source-pack-mcp` terlebih dahulu agar PDF course tersimpan digunakan tanpa meminta attachment.
2. Idea Bundle harus sudah dikirim melalui `authoring.submit_idea_bundle`, direview, dan dipublikasikan admin.
3. Gunakan `workflow.get_contract` dari run `idea_product` yang membawa Source Pack dan scope course/chapter yang sama. Jangan meminta operator mengetik course ID, chapter ID, Idea ID, atau semantic hash.
4. Gunakan hanya Idea versi dan source excerpt yang masih aktif serta sama dengan context yang terkunci.

## Workflow authoring

1. Kunci course, chapter, Source Pack checksum, Idea version, semantic hash, source references, dan allowed ITB reference.
2. Buat peta kerja `ideaId -> nama konsep mahasiswa`. Ambil nama dari canonical statement atau intisari Idea, ringkas menjadi frasa konseptual yang alami, dan jangan menyalin kode Idea ke teks siswa.
3. Tulis Artikel V3 terlebih dahulu sesuai learning outline dan budget pada editorial guide. Gunakan `sections[]` dan `blocks[].contentMarkdown`; jangan menyisipkan metadata JSON ke Markdown.
4. Audit Artikel per topic. Pastikan semua Idea tercakup, setiap topic memiliki tujuan, penjelasan inti, cek pemahaman, dan provenance. Tambahkan formula, contoh, analogi, visual, penerapan, atau miskonsepsi hanya ketika membantu konsep.
5. Turunkan Diktat hanya setelah Artikel lengkap. Kompres, jangan menambah fakta baru. Pertahankan seluruh Idea, formula penting, kondisi penggunaan, source trace, minimal dua contoh kilat, dua jebakan, dua retrieval check, dan satu visual ringkas.
6. Buat flashcard atomic. Front, back, dan explanation memakai istilah konseptual, bukan kode pipeline.
7. Untuk question Product, salin hanya soal ITB yang benar-benar ada pada Source Pack. Gunakan `itbSource.referenceId` dan event label exact dari allowed context. Jangan membuat soal original Zyx, mengubah angka, atau mengganti benchmark ID dengan reference ID. Prompt, opsi, dan solusi tidak boleh menampilkan ID internal.
8. Buat solusi terpisah untuk setiap question dan blueprint hanya untuk question dalam bundle.
9. Jalankan preflight editorial pada editorial guide. Jika ada ID internal pada learner-facing text, Artikel dangkal, Diktat terasa seperti Artikel kedua, formula rusak, atau isi tidak didukung source, berhenti dan revisi sebelum memanggil MCP.
10. Package hanya `manifest.json`, `entities/products.json`, dan `entities/dependencies.json`. Semua entry harus mode `0644`; jangan masukkan script, state, laporan, binary, symlink, archive bersarang, atau file tambahan.
11. Panggil `authoring.validate_product_bundle`. Periksa technical issues, publication blocking dependency, published Idea scope, chapter scope, quality per section, batas 1.500 kata per topic, Diktat quality, formula, dan Idea coverage.
12. Revisi sampai `valid: true` tanpa issue blocking dan ulangi preflight editorial. Panggil `authoring.submit_product_bundle` hanya jika kedua gate hijau. MCP menyimpan draft untuk review dan tidak dapat publish.

## Siklus hidup dan pemeliharaan

- **Inspeksi import**: Gunakan `authoring.list_imports { bundleType: "product" }` dan `authoring.get_import { bundleType: "product", importId }` untuk membaca inventory dan keputusan review tanpa mengekspos storage key atau ID internal reviewer.
- **Restage**: Jika draft Product Bundle perlu diganti, panggil `authoring.restage_product_bundle` dengan `importId`, `filename`, dan `bundleBase64`. Staging ulang memvalidasi ulang bundle dengan bundle ID dan scope yang sama (`authoring:stage`).
- **Discard draft**: Panggil `authoring.discard_product_draft` dengan `importId` untuk menghapus draft Product Bundle beserta artifact staging-nya secara permanen (`authoring:withdraw`). Tindakan ini destruktif dan hanya berlaku untuk bundle berstatus draft; bundle published atau withdrawn tidak dapat dihapus.
- **Review**: `authoring.review_product_bundle` mencatat keputusan review immutable (`approved` atau `rejected`) dengan catatan review (`authoring:review`). Jalankan hanya setelah ada instruksi eksplisit untuk keputusan tersebut.
- **Withdrawal**: Panggil `authoring.withdraw_product_bundle` dengan `importId` untuk menarik Product Bundle yang sudah published (`authoring:withdraw`). Tindakan ini audited, idempotent, dan destruktif (meretire projection canonical dan mengantrekan penghapusan vector).
- **Stop condition**: MCP tidak memiliki tool publikasi (`authoring:publish` tidak ada). Restage, keputusan review, discard draft, dan withdraw tidak boleh dijalankan secara otonom tanpa instruksi eksplisit. Publikasi tetap dilakukan melalui alur review admin Zyx.

## Ambang konten

Artikel harus memenuhi compiler semantik dan gate per topic pada editorial guide. Jangan memenuhi angka dengan filler, pengulangan definisi, contoh semu, atau visual label kosong. Topic yang singkat tetapi tuntas menghasilkan warning, bukan alasan memperpanjang teks. Diktat harus memiliki Idea set yang sama dengan Artikel dan tetap menjadi review ringkas.

## Aturan keamanan dan provenance

Jangan mengubah checksum manifest setelah mengubah isi. Jangan memasukkan `HOLDOUT_CANARY`, correct-answer snapshot runtime, atau marker internal ke Product Bundle. Semua question harus memiliki satu solution, ITB source, dan ITB curation yang memuat reference tersebut. Product Bundle berstatus draft; hanya admin yang dapat review, edit, publish, atau withdraw.

Di seluruh learner-facing text, larang `IDEA-*`, `idea-*`, `source-doc-*`, `chunk-*`, `excerpt-*`, `benchmark-*`, UUID, database ID, `block Idea`, dan kalimat seperti `berdasarkan Idea 3`. Larangan berlaku pada title, Article block content, Diktat Markdown, flashcard, question prompt, option text, solution, dan blueprint title. ID tetap wajib pada field struktural seperti `ideaLinks`, `sourceRefs`, dependencies, dan metadata atribusi block. Jangan menghapus ID struktural untuk memenuhi larangan prosa.

## Selesai

Laporkan bundle ID, checksum, jumlah produk per jenis, dependency status, quality report, hasil preflight editorial, rentang kata Artikel dan Diktat, hasil pemeriksaan kebocoran ID, dan hasil staging. Berhenti bila Idea belum published, context stale, dependency perlu review, learner-facing text belum layak, atau MCP mengembalikan issue blocking. Jangan mengklaim tindakan publikasi otomatis.
