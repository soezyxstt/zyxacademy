---
name: reference-question-ingest
description: Mengimpor soal historis dari PDF soal dan pembahasan yang sudah tersimpan untuk satu mata kuliah, menautkannya ke Idea published lintas bab, dan men-stage draft immutable dengan atribusi sumber melalui Zyx Authoring MCP. Jangan gunakan untuk soal original Zyx atau Product Bundle.
---

# Historical Reference Question Ingest

Gunakan skill ini untuk `reference_question_ingest`. Workflow ini membuat draft soal referensi historis yang tetap berada pada canonical `soal`, bukan engine asesmen kedua. MCP adalah enforcement layer untuk scope mata kuliah, provenance, Idea link, validasi draft, dan batas review admin.

## Batas scope

- Workflow mengunci satu mata kuliah dan tidak menerima `chapterKey`, `sourcePackToken`, atau `sourcePackId`.
- Sumber harus berupa PDF yang sudah tersimpan pada katalog course. Jangan meminta upload ulang dan jangan membuat Source Pack untuk workflow ini.
- Soal historis adalah immutable setelah dibuat. Tidak ada tool publikasi pada MCP; status akhir tetap menunggu review dan publication boundary admin.
- Jangan gunakan skill ini untuk membuat soal original Zyx. Gunakan `$zyx-question-authoring-mcp` untuk `quiz_bank`.
- Jangan membuat Idea baru, mengubah Idea, membuat soal original, atau menulis ulang wording sumber.
- Jangan memanggil `assessment.submit_quiz_draft`, `assessment.update_question`, `authoring.submit_product_bundle`, atau `authoring.submit_idea_bundle` dari workflow ini.
- Jangan menerjemahkan, mengoreksi, merapikan substansi, menambah kondisi, atau menginfer jawaban yang tidak terlihat pada sumber. Jika bukti tidak cukup, gunakan provenance `unavailable` atau `zyx_generated` sesuai kenyataan dan jangan menandai `quizEligible`.

## Urutan tool

1. Panggil `workflow.list`, lalu `catalog.list_courses` untuk memilih course key dari label manusia. Jangan meminta operator mengetik ID database.
2. Panggil `workflow.start` dengan `{ workflow: "reference_question_ingest", courseKey }`. Jangan menyertakan chapter atau Source Pack.
3. Panggil `workflow.get_contract` dan simpan contract checksum serta aturan draft.
4. Panggil `source.list_reference_files` untuk melihat PDF kategori `soal` dan `pembahasan_soal`. Gunakan `source.read_file` mode `pages` terlebih dahulu, maksimal 4 halaman per panggilan. Gunakan mode `blob` hanya sebagai fallback eksplisit bila page read gagal atau timeout, bukan sebagai jalur default.
5. Untuk setiap soal, panggil `knowledge.search_course_ideas` maksimal 3 kali dengan `limit` maksimal 10. Pilih maksimal 5 kandidat Idea yang paling relevan, lalu panggil `knowledge.get_idea` hanya untuk kandidat yang perlu dibedakan. Jangan mengambil seluruh katalog sebagai pengganti pencarian terarah.
6. Susun payload `reference-question-draft.v1`. Pertahankan teks soal, opsi, nomor soal, bagian, halaman, dan locator sesuai sumber. Jangan mengisi fakta atau jawaban yang tidak dapat ditelusuri.
7. Panggil `assessment.validate_reference_draft`. Perbaiki seluruh issue blocking dan periksa warning sebelum submit.
8. Panggil `assessment.submit_reference_draft` hanya setelah draft valid dan operator memang meminta staging. Tool membuat canonical historical rows, compatibility projection, solution draft, Idea links, provenance, dan audit tanpa publication.
9. Panggil `assessment.list_reference_questions` atau `assessment.get_reference_question` untuk verifikasi. Hasil harus memuat `source`, origin `historical_reference`, source and solution provenance, quiz eligibility, dan Idea links.

## Fidelity sumber dan batas tool

- Salin prompt, opsi, nomor, bagian, halaman, dan locator sebagaimana tampil pada source. Normalisasi hanya whitespace, Markdown, dan LaTeX yang tidak mengubah makna.
- `source.list_reference_files` adalah katalog course-level. `source.list_files` yang chapter-scoped bukan pengganti tool historis ini.
- Gunakan `source.read_file` untuk melihat teks dan gambar halaman. Jangan menyimpulkan isi halaman yang gagal dibaca dari nama file atau halaman lain.
- `assessment.submit_reference_draft` harus idempotent untuk source document, nomor soal, dan part yang sama. Jangan mengganti `localId` untuk menghindari konflik atau membuat duplikat.
- Workflow hanya men-stage status `generated` untuk `admin_review`. Commit, push, atau hasil validator bukan bukti publish.

## Aturan draft dan provenance

- `source.category` wajib `soal`; `solution.category`, bila ada, wajib `pembahasan_soal`.
- Source utama dan solution harus menunjuk file tersimpan yang benar. Kategori tidak boleh ditebak dari nama file saja.
- `answerProvenance` dan `solutionProvenance` hanya boleh `official`, `source_solution`, `zyx_generated`, atau `unavailable`. Jangan menyatakan jawaban official tanpa bukti pada sumber.
- Setiap soal harus memiliki minimal satu Idea published dari mata kuliah yang sama. Idea boleh berasal dari bab yang berbeda. Bobot Idea positif dan totalnya harus 1.
- `quizEligible` hanya boleh true bila tipe soal memiliki kunci yang dapat dievaluasi secara deterministik: `multiple_choice`, `multiple_choices`, atau `short_answer` dengan acceptable answers. Soal essay selalu false.
- Jika jawaban atau solusi tidak dapat dibuktikan, simpan provenance `unavailable` atau `zyx_generated` sesuai kenyataan dan biarkan eligibility false bila evaluasi tidak aman.
- Atribusi sumber wajib tersedia pada list, get, knowledge lookup, dan student citation ketika historical row dibaca. Jangan mempublikasikan raw database ID atau storage key ke learner-facing text.
- `source_solution` hanya boleh dipakai bila file pembahasan tersedia dan locator solusi dapat dipasangkan dengan nomor soal. Jangan menyimpan seluruh pembahasan sebagai solusi satu soal bila span soal tidak dapat ditentukan.
- `official` berarti kunci memang tampak pada sumber. `zyx_generated` berarti Zyx menghasilkan jawaban atau solusi, dan harus tetap dibedakan dari jawaban official.

## Stop conditions

Berhenti bila course mapping tidak tersedia, file sumber tidak cocok, halaman tidak dapat dibaca, source category salah, solution tidak dapat ditelusuri, Idea belum published, Idea lintas course, bobot tidak berjumlah 1, atau validasi mengembalikan issue blocking. Jangan memperbaiki kekurangan sumber dengan menebak.

## Selesai

Laporkan course label, jumlah soal valid, jumlah soal yang memiliki solution, jumlah Idea link, distribusi `quizEligible`, status `admin_review`, source attribution, warning yang tersisa, dan batas yang belum diverifikasi. Jangan mengklaim soal sudah published atau sudah masuk kuis runtime hanya karena submit berhasil.
