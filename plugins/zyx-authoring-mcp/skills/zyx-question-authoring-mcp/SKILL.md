---
name: zyx-question-authoring-mcp
description: Menyusun draft soal kuis yang terhubung ke Idea published melalui Zyx Authoring MCP, dengan scope mata kuliah dan bab yang dikunci, filter katalog Idea, tag, difficulty, cognitive level, bobot Idea link, validasi agregat, dan staging untuk review admin. Gunakan saat membuat atau merevisi bank soal kuis dari Idea yang sudah ada. Jangan gunakan untuk membuat Idea Bundle atau Product Bundle.
---

# Zyx Question Authoring MCP

Gunakan skill ini sebagai instruction layer untuk MCP quiz_bank. MCP adalah enforcement layer untuk scope mata kuliah dan bab, status published Idea, bobot link, dan review admin. Baca [references/workflow.md](references/workflow.md) sebelum mulai.

## Kompatibilitas host

Skill ini netral provider dan berlaku untuk host apa pun yang bisa memanggil MCP tools, termasuk Claude (Desktop, Code, chat lewat remote connector) dan ChatGPT (connector MCP remote). Langkah koneksi per host ada di [references/workflow.md](references/workflow.md). Saat dipakai sebagai instructions ChatGPT atau project, tempel isi skill tanpa frontmatter YAML; semua langkah tetap berlaku karena hanya merujuk nama tool dan kontrak JSON, bukan fitur host tertentu.

## Prasyarat

1. Koneksi ke Zyx Authoring MCP memakai akun admin Zyx aktif. Host dengan OAuth akan membuka alur sign-in; host tanpa OAuth interaktif memakai connection token singkat dari `/api/mcp/authoring/connection`.
2. Tentukan mata kuliah dan bab bersama operator. Jangan minta operator mengetik course ID, chapter ID, atau Idea ID internal.
3. Workflow `quiz_bank` tidak mewajibkan Source Pack. Jika konteks sumber tambahan diperlukan dan prompt hanya menyebut mata kuliah serta bab, jalankan `$zyx-source-pack-mcp` untuk membaca PDF course tersimpan tanpa meminta attachment. File lokal tetap dapat digunakan bila memang diberikan.

## Workflow authoring

1. Panggil `workflow.list`, lalu `catalog.list_courses` dan `catalog.list_chapters` untuk mendapatkan key mata kuliah dan bab.
2. Panggil `workflow.start` dengan `{ workflow: "quiz_bank", courseKey, chapterKey }` untuk mengunci scope dan mendapat `runToken`. Jika Source Pack opsional digunakan, sertakan `sourcePackToken` dan gunakan course serta chapter yang sama dengan stored originals.
3. Panggil `workflow.get_contract`. Patuhi `scopeGuidance`: enum difficulty, cognitive level, question type, idea role, aturan bobot, dan aturan tag.
4. Petakan Idea dengan `assessment.list_ideas`. Gunakan `query` untuk pencarian teks, serta filter `knowledgeKinds`, `instructionalRoles`, dan `difficultyLevels`. Baca `facets` untuk melihat distribusi dan lanjutkan paging lewat `paging.nextOffset`.
5. Untuk Idea kandidat, panggil `assessment.get_idea` guna membaca relasi prerequisite dan provenance sebelum menautkan soal.
6. Susun draft `question-bank-draft.v2`. Setiap soal mencantumkan prompt, options, correctIndices, explanation, difficulty, cognitiveLevel, reasoningPattern, tags, dan ideaLinks. Bobot positif ideaLinks harus berjumlah tepat 1 dan semua Idea wajib published dalam scope run.
7. Panggil `assessment.validate_quiz_draft`. Perbaiki semua issue blocking, lalu tinjau warnings seperti coverage gap dan pembahasan kosong. Ulangi sampai `valid: true`.
8. Panggil `assessment.submit_quiz_draft` hanya setelah valid. MCP menyimpan soal berstatus generated untuk review admin dan tidak dapat publish.

## Pengeditan soal dan pemeliharaan bank soal

- **Inspeksi bank soal**: Panggil `assessment.list_questions` untuk melihat daftar soal dalam scope (termasuk draft/in-review), `assessment.get_question` untuk detail soal dan Idea links, serta `assessment.analyze_bank` untuk analisis distribusi difficulty, cognitive level, dan coverage Idea (`authoring:read`).
- **Edit draft soal**: Gunakan `assessment.update_question` dengan `runToken`, `questionId`, `question`, dan `ideaLinks` (membutuhkan scope `authoring:stage`).
- **Batasan pengeditan soal**:
  - Soal wajib berada dalam scope mata kuliah dan bab yang dikunci oleh run token.
  - Hanya soal bertipe Zyx original (`origin = "zyx_original"`) yang dapat diedit. Soal contoh ITB (`origin = "itb_example"`) bersifat immutable dan tidak dapat diubah melalui tool ini.
  - Hanya soal yang belum published atau belum retired yang dapat diedit. Soal published atau retired ditolak.
  - Pengeditan yang berhasil akan mereset status soal menjadi `reviewStatus = "generated"` untuk peninjauan admin ulang.
- **Stop condition**: MCP tidak memiliki tool publikasi (`authoring:publish` tidak didukung). Semua soal baru atau soal hasil pembaruan masuk ke antrean review admin.

## Aturan mutu

Tutup sebanyak mungkin Idea pada katalog agar tidak ada coverage gap. Sesuaikan difficulty dan cognitiveLevel dengan tujuan pembelajaran bab, bukan seragam. Tag dipakai konsisten huruf kecil sebagai penanda subtopik. Jangan mengarang ideaId di luar hasil `assessment.list_ideas`; referensi basi akan ditolak sebagai not found atau scope mismatch.

## Selesai

Laporkan jumlah soal, jumlah soal tertaut Idea, distribusi difficulty dan cognitive level, sisa warnings, `questionIds` yang dibuat atau diperbarui, dan status `admin_review`. Berhenti bila ada issue blocking yang tidak bisa diperbaiki atau scope belum dikunci. Jangan mengklaim tindakan publikasi otomatis.
