---
name: zyx-idea-bundle-mcp
description: Menghasilkan Idea Bundle V3 dari Source Pack tervalidasi, dengan learningSections pedagogis, Idea atomic, provenance lengkap, relasi bebas siklus, dan quality report. Gunakan saat mengubah Source Pack menjadi Idea Bundle. Jangan gunakan untuk menerjemahkan sumber atau membuat Product Bundle.
---

# Zyx Idea Bundle MCP

Gunakan skill ini sebagai instruction layer untuk MCP. Validator repository dan `authoring.validate_idea_bundle` adalah sumber kebenaran schema, checksum, identity, provenance, dan quality gate. Baca [references/workflow.md](references/workflow.md) sebelum mulai.

## Prasyarat

1. Periksa ketersediaan Source Pack tersimpan untuk mata kuliah dan bab terkait menggunakan `source.list_packs`. Jika sudah tersedia Source Pack valid, gunakan `sourcePackToken` yang dikembalikan atau `packId`, lalu baca dokumen transkripsinya via `source.get_pack` tanpa perlu membuat ulang dari PDF. Jika belum ada, dapatkan Source Pack `valid: true` melalui `$zyx-source-pack-mcp`.
2. Panggil `workflow.start` dengan workflow `idea_product`, `sourcePackToken` (atau `sourcePackId`), dan course serta chapter opaque yang sama dengan stored originals. Jangan meminta operator mengetik ID teknis.
3. Panggil `workflow.get_contract` dan pertahankan `runToken` sampai submission selesai.

## Workflow authoring

1. Inventarisasikan seluruh source unit, formula, definisi, prinsip, prosedur, contoh, penerapan, constraint, miskonsepsi, visual explanation, soal, dan solusi.
2. Susun `learningSections` dalam urutan pedagogis. Hierarki maksimal tiga tingkat; setiap section memiliki tujuan belajar, Idea utama dan pendukung, serta source chunk. Nomor tampilan dihitung aplikasi, bukan disimpan.
3. Pecah kandidat menjadi Idea atomic. Satu Idea hanya boleh memuat satu klaim atau kemampuan yang dapat diajarkan dan dilacak, dan wajib memiliki tepat satu section utama.
4. Gunakan `sourcePolicy: source_grounded` untuk setiap Idea. Tulis canonical statement, concise explanation, knowledge kind, instructional role, formula, dan metadata tanpa menambahkan pengetahuan yang tidak memiliki bukti.
5. Buat source material dan source chunk dari teks Source Pack tanpa mengubah content. Offset harus exact dan checksum harus cocok.
6. Beri setiap Idea provenance primer. Gunakan relasi `prerequisite`, `related`, `extends`, `example_of`, atau `misconception_of` hanya jika hubungan dapat dijelaskan. Jangan membuat self relation, endpoint hilang, duplikat, atau siklus prerequisite.
7. Buat ZIP Idea Bundle V3 sesuai daftar file pada reference. Semua entry harus mode `0644`; jangan masukkan script, state, laporan, binary, symlink, archive bersarang, atau file tambahan.
8. Panggil `authoring.validate_idea_bundle`. Periksa hierarchy, primary section coverage, `issues`, `quality.issues`, `quality.metrics`, coverage sumber, duplicate candidate, dan formula trace warning.
9. Jika gagal, revisi isi dan package ulang. Jangan mengubah ID, course, chapter, source checksum, semantic hash, atau bundle checksum secara manual.
10. Panggil `authoring.submit_idea_bundle` hanya saat valid. MCP akan memvalidasi ulang dan memasukkan bundle ke review inventory. MCP tidak mempublikasikan Idea.

## Siklus hidup dan pemeliharaan

- **Inspeksi import**: Gunakan `authoring.list_imports { bundleType: "idea" }` dan `authoring.get_import { bundleType: "idea", importId }` untuk memeriksa inventory dan riwayat review tanpa mengekspos storage key atau ID internal reviewer.
- **Restage**: Jika import yang belum published perlu diperbaiki, panggil `authoring.restage_idea_bundle` dengan `importId`, `filename`, dan `bundleBase64`. Staging ulang akan memvalidasi ulang bundle dan mereset keputusan review sebelumnya melalui service lifecycle Zyx.
- **Review**: `authoring.review_idea_bundle` mencatat keputusan review immutable (`approved` atau `rejected`) dengan catatan review (membutuhkan scope `authoring:review`). Jalankan hanya setelah ada instruksi eksplisit untuk keputusan tersebut.
- **Batasan withdrawal**: Penarikan Idea Bundle (withdrawal) tidak diimplementasikan pada MCP.
- **Stop condition**: MCP tidak memiliki tool publikasi (`authoring:publish` tidak didukung). Restage dan keputusan review mengubah state tersimpan dan tidak boleh dijalankan secara otonom. Proses authoring berhenti setelah staging atau review selesai; publikasi Idea tetap dilakukan melalui UI admin atau alur backend Zyx.

## Gate konten

Quality gate harus menunjukkan meaningful source coverage 100 persen, provenance coverage 100 persen, tidak ada semantic duplicate candidate blocking, seluruh Idea berada pada chapter terkunci, dan seluruh Idea memiliki bukti sumber. Formula yang tidak memiliki notasi matematika terdeteksi diberi warning dan harus ditinjau.

Jangan membuat soal baru, Artikel, Diktat, flashcard, blueprint, atau Product entity pada tahap ini. Soal dan solusi dari Source Pack hanya menjadi bukti atau provenance.

## Selesai

Laporkan bundle ID, checksum, jumlah source, chunk, Idea, provenance, relasi, quality report, dan hasil staging. Admin tetap melakukan review dan publication Idea sebelum Product Bundle dibuat. Berhenti setelah staging berhasil dan jangan mengklaim tindakan publikasi otomatis.
