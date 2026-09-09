---
name: zyx-product-bundle-mcp
description: Menghasilkan Product Bundle V3 draft dengan Artikel terstruktur per subtopik, Diktat review, dan produk belajar lain yang siap dibaca mahasiswa tanpa kebocoran ID internal. Gunakan saat membuat Product Bundle dari Source Pack dan Idea published. Jangan gunakan untuk membuat Source Pack atau Idea Bundle.
---

# Zyx Product Bundle MCP

Gunakan skill ini sebagai instruction layer untuk MCP. MCP adalah enforcement layer untuk schema, checksum, provenance, dependency, chapter scope, published Idea, Article compiler, dan content quality. Sebelum menulis, wajib baca [references/workflow.md](references/workflow.md) dan [references/editorial-guide.md](references/editorial-guide.md). Laporan MCP hijau belum membuktikan bahwa materi nyaman dibaca mahasiswa; gate editorial pada skill ini juga wajib lulus.

## Batas Product Bundle V3

Product Bundle V3 menulis produk belajar saja: `article`, `diktat`, `flashcard_set`, dan child `flashcard`. Jangan membuat `question`, `solution`, `assessment_blueprint`, soal kuis Zyx, soal referensi historis, atau item asesmen melalui skill ini. Jika kebutuhan menyentuh asesmen, berhenti dan gunakan `zyx-question-authoring-mcp` untuk soal original atau `reference-question-ingest` untuk soal historis. Product Bundle V2 tetap dapat dibaca dan dipublikasikan demi kompatibilitas legacy, tetapi jangan membuat produk asesmen V2 baru.

## Hasil yang wajib dicapai

- **Artikel** adalah sumber belajar mandiri terstruktur per subtopik. Chapter memiliki overview, topic yang mengikuti learning section, summary, dan pemeriksaan akhir. Panjangnya ditentukan oleh ketuntasan tujuan belajar, bukan target kata atau durasi baca.
- **Diktat** adalah bahan review setelah Artikel, bukan Artikel kedua. Diktat mempertahankan seluruh Idea, formula penting, kondisi penggunaan, dan lineage, lalu harus benar-benar dirender menjadi PDF 2 sampai 4 halaman sebelum dinyatakan sesuai.
- Semua teks yang dilihat mahasiswa memakai nama konsep manusiawi seperti `Kinematika Benda Tegar`. ID seperti `IDEA-001` hanya boleh berada pada field metadata, provenance, dependency, dan atribusi block yang tidak dirender.

## Prasyarat

1. Source Pack harus sudah diterima `source.ingest` dengan `valid: true`. Jika pekerjaan dimulai hanya dari prompt mata kuliah dan bab, jalankan `$zyx-source-pack-mcp` terlebih dahulu agar PDF course tersimpan digunakan tanpa meminta attachment.
2. Idea Bundle harus sudah dikirim melalui `authoring.submit_idea_bundle`, direview, dan dipublikasikan admin.
3. Gunakan `workflow.get_contract` dari run `idea_product` yang membawa Source Pack dan scope course/chapter yang sama. Jangan meminta operator mengetik course ID, chapter ID, Idea ID, atau semantic hash.
4. Gunakan hanya Idea versi dan source excerpt yang masih aktif serta sama dengan context yang terkunci.

## Workflow authoring

1. Kunci course, chapter, Source Pack checksum, Idea version, semantic hash, source references, dan checksum contract MCP aktif.
2. Buat peta kerja `ideaId -> nama konsep mahasiswa`. Ambil nama dari canonical statement atau intisari Idea, ringkas menjadi frasa konseptual yang alami, dan jangan menyalin kode Idea ke teks siswa.
3. Sebelum drafting, rencanakan prasyarat, urutan penjelasan, tujuan terukur, representasi atau visual yang relevan, worked example, cek formatif, jawaban, pembahasan, miskonsepsi, dan batas berlaku untuk setiap topic. Ketidakrelevanan harus dinyatakan secara typed, bukan diisi filler.
4. Tulis Artikel V3 mengikuti rencana tersebut. Gunakan payload kontrak terbaru: `sections[]`, field section yang typed, dan `blocks[].contentMarkdown`, `ideaIds`, `sourceRefs`, serta payload typed untuk contoh, cek, dan visual. Jangan menyisipkan metadata JSON ke Markdown.
5. Audit Artikel per topic. Pastikan semua Idea dan tujuan tercakup, prasyarat tersedia, urutan penjelasan koheren, serta setiap cek memiliki jawaban dan pembahasan. Estimasi belajar adalah hasil dari konten tuntas, bukan batas yang harus dikejar.
6. Turunkan Diktat hanya setelah Artikel lengkap. Kompres, jangan menambah fakta baru. Pertahankan seluruh Idea, formula penting, kondisi penggunaan, source trace, contoh kilat, jebakan, dan cek ingatan yang memang relevan.
7. Buat flashcard atomic. Front, back, dan explanation memakai istilah konseptual, bukan kode pipeline.
8. Jangan membuat question, solution, atau assessment blueprint dalam Product Bundle V3. Jangan menyalin soal ITB, soal original Zyx, atau soal referensi historis ke bundle V3. Jika produk belajar memerlukan asesmen, buat atau baca asesmen melalui workflow MCP yang sesuai, lalu pertahankan batas produk V3.
9. Jalankan preflight author pada editorial guide. Jika ada ID internal pada learner-facing text, tujuan belum tuntas, prasyarat hilang, cek tanpa pembahasan, Diktat terasa seperti Artikel kedua, formula rusak, visual tidak informatif, atau isi tidak didukung source, berhenti dan revisi sebelum memanggil MCP.
10. Package hanya `manifest.json`, `entities/products.json`, dan `entities/dependencies.json`. Semua entry harus mode `0644`; jangan masukkan script, state, laporan, binary, symlink, archive bersarang, atau file tambahan.
11. Panggil `authoring.validate_product_bundle`. Periksa technical issues, publication blocking dependency, published Idea scope, chapter scope, quality per section, Diktat quality, formula, dan Idea coverage.
12. Revisi sampai `valid: true` tanpa issue blocking dan ulangi preflight author. Panggil `authoring.submit_product_bundle` hanya jika kedua gate hijau. MCP hanya membuat draft review, bukan bukti pedagogi lulus, PDF sesuai, atau siap publikasi.

## Siklus hidup dan pemeliharaan

- **Inspeksi import**: Gunakan `authoring.list_imports { bundleType: "product" }` dan `authoring.get_import { bundleType: "product", importId }` untuk membaca inventory dan keputusan review tanpa mengekspos storage key atau ID internal reviewer.
- **Restage**: Jika draft Product Bundle perlu diganti, panggil `authoring.restage_product_bundle` dengan `importId`, `filename`, dan `bundleBase64`. Staging ulang memvalidasi ulang bundle dengan bundle ID dan scope yang sama (`authoring:stage`).
- **Discard draft**: Panggil `authoring.discard_product_draft` dengan `importId` untuk menghapus draft Product Bundle beserta artifact staging-nya secara permanen (`authoring:withdraw`). Tindakan ini destruktif dan hanya berlaku untuk bundle berstatus draft; bundle published atau withdrawn tidak dapat dihapus.
- **Review**: `authoring.review_product_bundle` mencatat keputusan review immutable (`approved` atau `rejected`) dengan catatan review (`authoring:review`). Jalankan hanya setelah ada instruksi eksplisit untuk keputusan tersebut.
- **Withdrawal**: Panggil `authoring.withdraw_product_bundle` dengan `importId` untuk menarik Product Bundle yang sudah published (`authoring:withdraw`). Tindakan ini audited, idempotent, dan destruktif (meretire projection canonical dan mengantrekan penghapusan vector).
- **Stop condition**: MCP tidak memiliki tool publikasi (`authoring:publish` tidak ada). Restage, keputusan review, discard draft, dan withdraw tidak boleh dijalankan secara otonom tanpa instruksi eksplisit. Publikasi tetap dilakukan melalui alur review admin Zyx.

## Ambang konten

Artikel harus memenuhi compiler semantik dan menuntaskan tujuan per topic pada editorial guide. Jangan menambah filler, pengulangan definisi, contoh semu, atau visual label kosong untuk mengejar angka. Diktat harus memiliki Idea set yang sama dengan Artikel dan tetap menjadi review ringkas. Status PDF hanya boleh disebut siap setelah artefak nyata dirender, page count terukur, dan pemeriksaan visual selesai.

## Aturan keamanan dan provenance

Jangan mengubah checksum manifest setelah mengubah isi. Jangan memasukkan `HOLDOUT_CANARY`, correct-answer snapshot runtime, atau marker internal ke Product Bundle. Product Bundle V3 hanya memuat produk belajar yang diizinkan dan tidak memiliki question, solution, atau assessment blueprint. Product Bundle berstatus draft; hanya admin yang dapat review, edit, publish, atau withdraw.

Di seluruh learner-facing text, larang `IDEA-*`, `idea-*`, `source-doc-*`, `chunk-*`, `excerpt-*`, `benchmark-*`, UUID, database ID, `block Idea`, dan kalimat seperti `berdasarkan Idea 3`. Larangan berlaku pada title, Article block content, Diktat Markdown, flashcard, dan metadata produk belajar yang dirender. ID tetap wajib pada field struktural seperti `ideaLinks`, `sourceRefs`, dependencies, dan metadata atribusi block. Jangan menghapus ID struktural untuk memenuhi larangan prosa.

## Selesai

Laporkan bundle ID, checksum, checksum contract, jumlah produk per jenis, dependency status, quality report MCP, hasil preflight author, estimasi belajar per topic, hasil pemeriksaan kebocoran ID, hasil render PDF bila benar-benar dilakukan, dan hasil staging. Bedakan secara eksplisit preflight author, validator MCP, review pedagogi admin, status PDF, dan kesiapan publikasi. Berhenti bila Idea belum published, context stale, dependency perlu review, learner-facing text belum layak, atau MCP mengembalikan issue blocking. Jangan mengklaim tindakan publikasi otomatis.
