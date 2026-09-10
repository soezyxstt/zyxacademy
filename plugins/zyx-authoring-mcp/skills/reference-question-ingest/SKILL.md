---
name: reference-question-ingest
description: Mengimpor soal historis verbatim dari PDF soal/pembahasan tersimpan untuk satu course, dengan source locator, provenance jawaban/solusi, published Idea links lintas bab, dan handling eksplisit untuk multipart/shared-stimulus/multi-page cases. Jangan gunakan untuk soal original atau Product Bundle.
---

# Historical Reference Question Ingest

Gunakan skill ini untuk workflow `reference_question_ingest`. Historical question tetap canonical `soal`; workflow ini bukan assessment engine kedua.

## Invariant yang tidak boleh dilanggar

1. Workflow mengunci **satu course** dan tidak memakai `chapterKey`/Source Pack.
2. Sumber hanya PDF tersimpan kategori yang sah; jangan meminta upload ulang bila file katalog tersedia.
3. Teks historical question dipertahankan fidelity. Normalisasi hanya whitespace, Markdown, dan LaTeX yang tidak mengubah makna.
4. Jangan menerjemahkan, mengoreksi, menyederhanakan, mengganti angka, menambah syarat, atau mengisi jawaban yang tidak terlihat.
5. Setiap row wajib memiliki minimal satu published Idea dari course yang sama; cross-chapter boleh.
6. Historical row immutable setelah dibuat dari workflow ini.
7. `quizEligible` hanya true jika evaluasi deterministik aman dan provenance jawaban cukup.
8. Validator hijau tidak mengizinkan author menebak source locator, answer, solution, atau mapping part.

## Batas scope

- Soal original Zyx → `$zyx-question-authoring-mcp`.
- Product learning content → `$zyx-product-bundle-mcp`.
- Jangan membuat/mengubah Idea.
- Jangan memanggil quiz-bank submit/update atau Product/Idea submit dari workflow ini.
- MCP tidak menyediakan publication tool; submit hanya men-stage untuk admin review.

## Urutan tool

1. `workflow.list` dan `catalog.list_courses`; pilih course dari label manusia.
2. `workflow.start { workflow: "reference_question_ingest", courseKey }`; jangan sertakan chapter/Source Pack.
3. `workflow.get_contract`; simpan contract checksum dan aturan draft.
4. `source.list_reference_files`; pilih file kategori `soal` dan, bila ada, `pembahasan_soal` dari metadata katalog, bukan nama file saja.
5. `source.read_file` mode `pages`, maksimal 4 halaman per panggilan. Gunakan extracted text **dan page image**; mode `blob` hanya fallback eksplisit setelah page read gagal/timeout.
6. Inventarisasi question boundaries sebelum membuat row: nomor, part, shared stimulus, opsi, halaman awal/akhir, dan candidate solution locator.
7. Untuk setiap question/part, cari Idea via `knowledge.search_course_ideas` maksimal 3 query × limit 10. Buka `knowledge.get_idea` hanya untuk maksimal 5 kandidat yang perlu dibedakan.
8. Susun `reference-question-draft.v1` dengan wording/source locator fidelity dan provenance yang jujur.
9. `assessment.validate_reference_draft`; perbaiki blocking issue dan tinjau warning.
10. `assessment.submit_reference_draft` hanya jika valid dan staging diminta.
11. Verifikasi lewat `assessment.list_reference_questions`/`assessment.get_reference_question`.

## Fidelity sumber

Pertahankan:

- nomor soal dan part (`a`, `b`, dst.);
- section/event label bila ada;
- prompt dan semua kondisi;
- opsi beserta wording;
- tabel/gambar/shared stimulus yang diperlukan;
- page/source locator;
- answer/solution hanya bila dapat ditelusuri.

Jangan menyimpulkan isi halaman gagal baca dari file name, nomor soal, atau pengetahuan umum.

## Edge cases wajib

### Multipart question

- Satu nomor dengan part `a/b/c` harus mempertahankan hubungan part.
- Jangan menggabungkan part menjadi satu prompt bila tiap part memiliki target/jawaban berbeda dan contract mendukung part terpisah.
- Jangan membuat part baru dari bullet yang sebenarnya hanya data soal.

### Shared stimulus

Jika satu teks/tabel/gambar dipakai beberapa nomor:

- identifikasi stimulus boundary terlebih dahulu;
- pastikan setiap row tetap dapat menunjuk stimulus yang sama tanpa mengubah isi;
- jangan menduplikasi stimulus dengan wording berbeda pada tiap question.

### Opsi pindah halaman

Jika stem/opsi berlanjut ke halaman berikutnya, gabungkan hanya bila nomor, indentation, dan layout jelas menunjukkan kontinuitas. Jika satu opsi terpotong dan teks akhirnya tidak terbaca, question belum aman untuk submit.

### Grafik/tabel/diagram

Jangan mengganti visual dengan tebakan prose. Simpan locator/representasi sesuai contract dan pertahankan semua label/nilai yang terbaca. Jika visual menentukan jawaban tetapi tidak dapat dibaca, stop.

### Nomor sama pada dokumen berbeda

Identity/idempotency harus tetap dibedakan oleh source document + nomor + part sesuai contract. Jangan mengganti `localId` secara acak untuk menghindari conflict.

### Pembahasan multi-page

Pasangkan solution ke question hanya jika nomor/part dan locator cukup jelas. Jangan mengambil seluruh halaman pembahasan sebagai solution satu soal bila span tidak dapat ditentukan.

### Kunci jawaban tanpa pembahasan

Jika key terlihat jelas, `answerProvenance` dapat `official`. Jangan mengubahnya menjadi `source_solution` kecuali solution file/span memang ada.

## Provenance

Nilai provenance hanya sesuai contract, termasuk `official`, `source_solution`, `zyx_generated`, atau `unavailable`.

- `official`: answer/key tampak pada sumber resmi.
- `source_solution`: solution dapat ditelusuri ke file pembahasan dan question/part yang tepat.
- `zyx_generated`: Zyx membuat answer/solution; jangan tampilkan seolah official.
- `unavailable`: bukti tidak tersedia/cukup.

Jika answer/solution tidak dapat dibuktikan, jangan mengarang untuk membuat `quizEligible` true.

## Idea links

Setiap historical question wajib memiliki minimal satu Idea published dari course sama. Bobot positif total = 1. Gunakan Idea lintas chapter hanya bila question memang menilai beberapa bab; jangan memilih Idea hanya karena kata kuncinya mirip.

Jika mapping Idea ambigu setelah batas pencarian, berhenti untuk review daripada mengambil seluruh katalog atau menebak.

## Quiz eligibility

`quizEligible: true` hanya bila:

- type dapat dinilai deterministik (`multiple_choice`, `multiple_choices`, atau `short_answer` dengan acceptable answer yang aman sesuai contract);
- answer provenance cukup;
- visual/stimulus yang diperlukan tersedia;
- tidak ada ambiguity pada key.

Essay selalu false. Jika evaluasi tidak aman, false walaupun question berhasil di-ingest.

## Stop conditions

Berhenti bila course/file category salah, page/visual penting tidak dapat dibaca, question boundary ambigu, multipart mapping tidak pasti, solution span tidak dapat ditelusuri, Idea mapping tidak aman, Idea belum published/cross-course, weight invalid, atau validator memberi blocking issue. Jangan memperbaiki kekurangan sumber dengan tebakan.

## Selesai

Laporkan course label, source files, jumlah question/part valid, shared-stimulus/multi-page cases yang ditemukan, jumlah solution terpasang, provenance distribution, Idea link count, `quizEligible` distribution, warning, status `admin_review`, dan batas yang belum diverifikasi. Jangan mengklaim published atau sudah masuk quiz runtime.