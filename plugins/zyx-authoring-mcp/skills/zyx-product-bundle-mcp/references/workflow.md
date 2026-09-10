# Product Bundle MCP reference

## Scope Product Bundle V3

Authoring Product Bundle V3 hanya membuat:

```text
article
diktat
flashcard_set
flashcard
```

Jangan membuat `question`, `solution`, atau `assessment_blueprint` pada Product Bundle V3. Produk asesmen lama pada Product Bundle V2 hanya bagian kompatibilitas legacy dan bukan template authoring baru.

Peran learner-facing bersifat tetap:

- Artikel = satu-satunya bacaan utama untuk belajar bab;
- Diktat = review pra-ujian yang diturunkan dari Artikel;
- Flashcard = active recall atas hal yang sudah diajarkan di Artikel.

Baca [editorial-guide.md](editorial-guide.md) dan [flashcard-guide.md](flashcard-guide.md) sebelum drafting.

## Canonical ZIP

Gunakan tepat:

```text
manifest.json
entities/products.json
entities/dependencies.json
```

Semua product adalah draft. Setiap product harus memakai published Idea links, active source references, deterministic generation hashes, dan dependency hashes yang tepat.

Article V3 disimpan dalam `sections[]`; setiap topic memiliki tepat satu `learningSectionId`, sementara overview dan summary boleh mencakup beberapa Idea. Setiap block menyimpan `blockType`, optional `title`, `contentMarkdown`, `ideaIds`, dan `sourceRefs` sebagai field terpisah. Gunakan typed section pedagogy, worked example, formative check, visual, evaluation, dan feedback payload dari `workflow.get_contract` terbaru; jangan menaruh compatibility JSON di Markdown.

## Quality gates

MCP memeriksa typed product, checksum, source/Idea provenance, chapter scope, published Idea version/hash, dependency freshness, holdout marker, semantic Article compiler gates, formative checks, flashcard atomicity, Diktat lineage, formula, dan Idea coverage.

Author preflight tetap wajib dan harus memeriksa hal yang tidak cukup dijamin schema:

- Artikel self-contained untuk first learning;
- tidak ada fakta learner-facing pada Diktat/flashcard yang belum diajarkan di Artikel;
- Diktat benar-benar ringkas untuk review;
- flashcard hanya satu recall target dan tidak duplikat/filler;
- zero internal-ID leak;
- penjelasan, contoh, cek, jawaban, dan pembahasan cukup untuk tujuan belajar.

`publicationBlocked`, stale Idea links, missing chapter, atau blocking quality issue mencegah validation/submission. `valid: true` diperlukan tetapi tidak cukup untuk menyatakan konten layak publish.

## MCP tool sequence

1. Gunakan run `idea_product` dengan scope yang sama dan published Idea context yang fresh. Catat run ID, contract checksum, Source Pack checksum, Idea versions/hashes, dan intended Product checksum.
2. Jika Source Pack belum tersedia dan prompt hanya menyebut course/chapter, jalankan `$zyx-source-pack-mcp` dari stored PDFs.
3. Rencanakan setiap topic sebelum menulis: prerequisite, objective, sequence, representation/visual, example, formative check, answer, explanation, misconception/boundary.
4. Bangun **Artikel lebih dulu sampai self-contained**.
5. Turunkan Diktat dari Artikel yang sudah lengkap; jangan menambah fakta baru.
6. Buat flashcard hanya dari recall target yang sudah ada di Artikel; jalankan `flashcard-guide.md`.
7. Jalankan author preflight `editorial-guide.md` dan flashcard preflight.
8. Panggil `authoring.validate_product_bundle` (`authoring:read`).
9. Perbaiki issue, ulangi author preflight, lalu validasi ulang. Jangan mengurangi konten penting hanya untuk mengejar metric.
10. Panggil `authoring.submit_product_bundle` hanya bila MCP hijau, preflight author lulus, dan staging diminta (`authoring:stage`).
11. Untuk existing Product imports, gunakan lifecycle tool sesuai SKILL.md; destructive/review mutations tidak boleh dijalankan tanpa instruksi eksplisit.

## Resume dan evidence

Resume hanya bila artifact checksum, run ID, contract checksum, course/chapter scope, Source Pack checksum, published Idea versions/hashes, dan dependency freshness cocok dengan checkpoint. Ingatan sesi lama bukan evidence.

Jika salah satu berubah, refresh contract/context dan revalidate artifact yang terdampak.

Pisahkan dalam laporan:

1. author preflight;
2. MCP validation;
3. admin pedagogic review;
4. Diktat PDF render evidence;
5. publication readiness.

Jangan infer admin approval dari MCP green. Jangan infer kualitas/page count PDF tanpa artifact render nyata dan inspeksi halaman. MCP tidak menyediakan publication tool.