---
name: zyx-question-authoring-mcp
description: Menyusun atau merevisi soal `zyx_original` yang wajib terhubung ke Idea published, menutup gap nyata pada bank soal, memakai historical reference hanya sebagai konteks read-only, dan lulus author quality preflight sebelum MCP validation. Jangan gunakan untuk Product Bundle atau ingest soal historis verbatim.
---

# Zyx Question Authoring MCP

Gunakan skill ini untuk workflow `quiz_bank`. MCP menegakkan scope, published Idea, schema, link weight, dan lifecycle review, tetapi validator bukan pengganti quality judgment author.

Sebelum mulai, wajib baca:

- [references/workflow.md](references/workflow.md)
- [references/question-quality.md](references/question-quality.md)

## Invariant yang tidak boleh dilanggar

1. `quiz_bank` hanya membuat/mengubah `zyx_original`.
2. Setiap soal baru atau `zyx_original` yang diperbarui **wajib memiliki minimal satu published Idea link dalam scope** dan tepat satu target utama.
3. Historical reference hanya konteks read-only untuk memahami bentuk ujian dan gap. Jangan menyalin wording verbatim melalui skill ini.
4. Jangan membuat soal hanya untuk mengejar coverage count. Setiap soal baru harus menutup gap target, cognitive level, difficulty, question type, reasoning pattern, atau miskonsepsi yang nyata.
5. Author quality preflight wajib lulus sebelum `assessment.validate_quiz_draft` dan setelah setiap revisi.
6. `valid: true` MCP tidak cukup untuk submit bila kualitas isi belum lulus preflight.

Schema legacy dapat menerima soal tanpa Idea link. Kelonggaran itu hanya untuk kompatibilitas data lama; **authoring baru melalui skill ini tetap wajib Idea-linked**.

## Batas dengan historical reference

Untuk menyalin soal historis sebagaimana sumber dan menyimpan atribusi, gunakan `$reference-question-ingest`. Dari skill ini:

- boleh baca `historical_reference`;
- tidak boleh edit/delete historical row;
- bila soal original terinspirasi referensi, gunakan `referenceLinks` sesuai contract dan role yang jujur (`inspired_by`, `adapted_from`, `derived_from`);
- jangan menyamarkan salinan verbatim sebagai soal original.

## Prasyarat

1. Koneksi Authoring MCP memakai akun admin Zyx aktif.
2. Tentukan course dan chapter bersama operator dari label manusia; jangan minta ID database/Idea.
3. Source Pack tidak wajib untuk `quiz_bank`, tetapi gunakan `$zyx-source-pack-mcp` bila konteks bukti tambahan memang diperlukan.
4. Jangan mulai menulis soal sebelum scope dikunci dan contract aktif dibaca.

## Workflow authoring

1. Panggil `workflow.list`, `catalog.list_courses`, dan `catalog.list_chapters`.
2. Panggil `workflow.start { workflow: "quiz_bank", courseKey, chapterKey, sourcePackToken? }`.
3. Panggil `workflow.get_contract`; patuhi enum/field/weight/tag contract terbaru.
4. Petakan published Idea dengan `assessment.list_ideas`; gunakan filter/paging, jangan mengarang Idea ID.
5. Untuk target kandidat, panggil `assessment.get_idea` untuk statement, provenance, prerequisite, relation, dan konteks yang diperlukan.
6. Baca bank soal `zyx_original` yang sudah ada untuk target tersebut dengan `assessment.list_questions`/`assessment.get_question` agar tidak membuat semantic duplicate.
7. Baca historical reference yang relevan dengan `assessment.list_reference_questions { ideaId }` maksimal 10 hasil per Idea; buka maksimal 5 detail dengan `assessment.get_reference_question`.
8. Lakukan gap analysis per Idea. Catat apa yang belum tercover secara substantif: target, cognitive level, difficulty, question type, reasoning pattern, representasi, atau miskonsepsi.
9. Buat rencana tiap soal sesuai `question-quality.md`: primary Idea, supporting/required Idea, observable target, type, cognitive level, difficulty, reasoning pattern, expected reasoning, historical relation.
10. Tulis `question-bank-draft.v2`. Setiap soal wajib punya prompt, jawaban/kunci, explanation, difficulty, cognitiveLevel, reasoningPattern, tags, minimal satu `ideaLink`, dan `referenceLinks` bila relevan.
11. Jalankan author preflight `question-quality.md` untuk **setiap soal**. Revisi semua kegagalan sebelum memanggil MCP.
12. Panggil `assessment.validate_quiz_draft`.
13. Perbaiki blocking issue dan warning substantif. Setelah revisi, ulangi author preflight, lalu validasi ulang.
14. Panggil `assessment.submit_quiz_draft` hanya bila draft valid, preflight lulus, dan operator telah meminta/menyetujui staging.

## Aturan soal inti

- Difficulty berasal dari beban penalaran, bukan angka besar, prose sengaja rumit, atau data sampah.
- Cognitive level ditentukan dari pekerjaan mental nyata, bukan kata kerja stem.
- Multiple-choice distractor harus merepresentasikan miskonsepsi/error yang masuk akal; jangan memakai opsi acak atau jelas bodoh.
- Short answer hanya untuk jawaban yang dapat dinilai dengan bentuk ringkas dan aman.
- Essay dipakai bila target memang analisis/evaluasi/sintesis yang tidak cocok dipaksa menjadi opsi.
- Pembahasan wajib menjelaskan konsep, langkah/alasan utama, dan hasil; jangan hanya menyebut huruf opsi atau “sesuai rumus”.
- Jangan membuat soal yang berbeda hanya angka/nama konteks dari soal existing.
- Jangan memakai fakta yang tidak dapat dilacak ke Idea/source yang tersedia.

Detail lengkap ada di `references/question-quality.md` dan bersifat blocking author rule.

## Pengeditan dan lifecycle

- `assessment.list_questions`, `assessment.get_question`, `assessment.analyze_bank`: inspeksi read-only.
- `assessment.update_question`: hanya `zyx_original` berstatus editable dalam scope; update harus tetap lulus preflight dan membuat row kembali menunggu review sesuai service lifecycle.
- `historical_reference` dan origin legacy non-original adalah immutable dari workflow ini.
- MCP tidak menyediakan tool publish. Jangan menyatakan generated/reviewed = published.

## Stop conditions

Berhenti jika:

- course/chapter belum pasti;
- target Idea tidak published atau di luar scope;
- soal memerlukan fakta yang tidak dapat dibuktikan;
- historical source dibutuhkan tetapi tidak dapat dibaca/ditelusuri;
- candidate baru hanya duplikat semantik soal existing;
- kunci/jawaban ambigu atau tidak dapat diverifikasi;
- preflight quality gagal dan tidak dapat diperbaiki;
- MCP mengembalikan blocking issue yang membutuhkan keputusan substantif.

## Selesai

Laporkan jumlah soal, jumlah dengan Idea link, primary Idea coverage, distribusi difficulty/cognitive level/question type, gap yang sengaja dibiarkan, jumlah soal dengan historical lineage per role, hasil author preflight, warning MCP tersisa, question IDs yang dibuat/diperbarui, dan status `admin_review`. Jangan mengklaim publication otomatis.