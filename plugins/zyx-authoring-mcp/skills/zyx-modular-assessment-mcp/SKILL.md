---
name: zyx-modular-assessment-mcp
description: Membuat atau memperbarui kuis, tryout, soal tunggal, serta pembahasan modular berbasis Assessment UI-SDK (multistep, collapsible, gambar, grafik 2D, scene 3D) via MCP secara ringkas dan hemat token tanpa verifikasi berlapis.
---

# Kuis, Tryout, dan Pembahasan Modular via MCP

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-stg` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.6"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain. Verifikasi identitas koneksi sebelum melakukan perubahan.

Panggil nama tool dari `tools/list`. Nama bertitik di skill ini merujuk ke operasi; nama panggilan biasanya mengganti titik dengan `_`, seperti `admin_environment`. Pengecualian: `authoring.get_solution_collection_review_context` memakai `authoring_solution_review_context`. Pertahankan nama bertitik pada argumen `operation` serta identitas konfirmasi dan receipt.
<!-- END:environment-connection -->

Jika akses kedaluwarsa atau izin kurang, ikuti [pemulihan koneksi](../zyx-operation-recovery/SKILL.md#koneksi-oauth) pada environment yang sama. Untuk mutu bahasa penjelasan, gunakan [bahasa-ajar](../bahasa-ajar/SKILL.md) (Bahasa Indonesia) atau [instructional-language](../instructional-language/SKILL.md) (Bahasa Inggris).

## Kapan memakai skill ini

Gunakan jalur modular ini untuk:
- Membuat atau memperbarui kuis (`kind: "quiz"`) maupun tryout (`kind: "tryout"`) secara langsung.
- Menambah atau mengubah **1 soal** tanpa mengirim ulang seluruh kuis atau tryout.
- Memperbarui atau menambal (`patch`) **khusus pembahasan 1 soal** dengan blok Assessment UI-SDK.

Jangan jalankan `workflow.start`, `assessment.validate_quiz_draft`, atau seremoni preflight berlapis jika tugas cukup memakai 4 tool modular berikut.

## 4 Tool Modular (Ringkas & Hemat Token)

1. `authoring.upsert_assessment` (`authoring_upsert_assessment`, scope `authoring:stage`): buat atau perbarui kuis atau tryout dalam 1 panggilan (`courseId`, `kind`, `id` opsional, `title`, `status`, `questions` opsional).
2. `authoring.list_assessment_questions` (`authoring_list_assessment_questions`, scope `authoring:read`): lihat daftar ringkas soal (`id`, `order`, `type`, `promptPreview`, `hasExplanation`, `hasExplanationUi`, `hasPromptUi`). Tambahkan `includeFull: true` hanya bila perlu membaca isi penuh.
3. `authoring.upsert_question` (`authoring_upsert_question`, scope `authoring:stage`): tambah atau perbarui 1 soal (`multiple_choice`, `multiple_choices`, `short_answer`, atau `essay`) beserta `promptUi` dan/atau `explanationUi`. Jika hanya mengirim UI-SDK spec, server otomatis menurunkan teks markdown fallback.
4. `authoring.update_question_explanation` (`authoring_update_question_explanation`, scope `authoring:stage`): perbarui **hanya pembahasan** 1 soal berdasarkan `questionId` tanpa menyentuh prompt, opsi, kunci jawaban, atau soal lain.

Baca resource `ui://zyx-authoring/modular-assessment-sdk.md` bila butuh pengingat ringkas katalog blok dan operasi patch.

## Assessment UI-SDK v1 (`promptUi` & `explanationUi`)

Susun `blocks` sesuai kebutuhan soal; tidak ada komponen yang wajib dipakai jika soal sederhana (boleh 1 blok `markdown` saja):
- `markdown`: narasi teks dan rumus KaTeX (`$...$`, `$$...$$`).
- `steps`: pembahasan multi-langkah (otomatis tampil paginated di sisi siswa; sertakan hanya bila soal memang butuh beberapa tahap).
- `collapsible`: bagian lipat opsional (`variant`: `hint`, `derivation`, `detail`, `note`).
- `callout`: sorotan (`tone`: `info`, `tip`, `warning`, `formula`, `mistake`).
- `formula_card`: kartu rumus utama dengan `latex` dan `note` opsional.
- `image`: gambar atau diagram dengan `src`, `alt`, `caption` opsional.
- `graph`: grafik 2D interaktif (`spec` dengan `initialFormula` atau spesifikasi kanvas belajar).
- `scene_3d`: visualisasi 3D interaktif.
- `interactive_visual`: visual interaktif (`kind`: `canvas`, `document`, `chart`, `flowchart`).

`id` pada tiap blok dan langkah bersifat opsional; server membuat ID deterministik otomatis bila dikosongkan.

## Patch Modular Per Soal

Saat memperbarui pembahasan yang sudah ada lewat `authoring.update_question_explanation`, pilih mode paling hemat:
- **Ganti penuh**: kirim `explanationUi` baru.
- **Patch parsial (`patch`)**: kirim satu operasi (`replace_all`, `upsert_block` dengan `afterBlockId` opsional, `remove_block`, `upsert_step`, atau `remove_step`) agar blok lain tetap utuh.

## Aturan Penulisan

- Jangan memakai em dash atau en dash di mana pun dalam prompt, opsi, maupun pembahasan; gunakan koma, titik koma, tanda kurung, atau kata `sampai`.
- Pastikan seluruh rumus, satuan, dan perhitungan diverifikasi sebelum disimpan.
