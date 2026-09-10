# Question authoring MCP reference

Baca bersama [question-quality.md](question-quality.md). File ini menjelaskan kontrak/tool; `question-quality.md` menentukan quality gate author.

## Host setup

Gunakan koneksi/environment yang dipilih operator. Endpoint `https://staging.zyxacademy.com/api/mcp/authoring` hanya untuk staging; jangan berpindah environment karena menyalin contoh ini. Verifikasi identitas environment dari koneksi sebelum staging.

Gunakan OAuth admin pada host yang mendukung. Host tanpa OAuth interaktif memakai connection token sesuai prosedur Zyx; jangan simpan credential/token di repository, artifact, atau config yang dikomit.

## Tool sequence

```text
workflow.list
catalog.list_courses
catalog.list_chapters { courseKey }
workflow.start { workflow: "quiz_bank", courseKey, chapterKey, sourcePackToken? }
workflow.get_contract { runToken }

assessment.list_ideas { runToken, query?, knowledgeKinds?, instructionalRoles?, difficultyLevels?, limit?, offset? }
assessment.get_idea { runToken, ideaId }

assessment.list_questions { runToken, query?, difficulty?, cognitiveLevel?, questionType?, origin?, status?, limit?, offset? }
assessment.get_question { runToken, questionId }
assessment.analyze_bank { runToken }

assessment.list_reference_questions { runToken, query?, ideaId?, chapterKey?, assessmentType?, year?, institution?, difficulty?, cognitiveLevel?, questionType?, quizEligible?, status?, limit?, offset? }
assessment.get_reference_question { runToken, questionId }

assessment.validate_quiz_draft { runToken, draftJson }
assessment.submit_quiz_draft { runToken, draftJson }  // authoring:stage
assessment.update_question { runToken, questionId, question, ideaLinks } // authoring:stage
```

Daftar argumen di atas mengikuti tool registry saat skill ini ditulis. `workflow.get_contract` dan tool schema aktif tetap menang bila contract berubah. Jangan menebak field yang tidak tersedia.

`workflow.start` tanpa Source Pack sah untuk `quiz_bank`. Bila Source Pack dipakai, course/chapter harus sama dengan scope run.

## Katalog Idea

`assessment.list_ideas` memberi published Idea dalam scope, beserta facets dan paging. Gunakan query/filter untuk discovery dan `paging.nextOffset` sampai kandidat target cukup dipahami.

`assessment.get_idea` dipakai untuk memeriksa statement, explanation, latex, prerequisite/relation, provenance, version, dan semantic hash sebelum menautkan soal.

### Aturan authoring vs kompatibilitas legacy

Schema storage/draft dapat tetap membaca soal lama tanpa `ideaLinks`. Itu **bukan izin** untuk authoring baru.

Untuk setiap soal baru atau `zyx_original` yang diperbarui melalui skill:

- minimal satu Idea published dalam scope wajib ditautkan;
- tepat satu link `role: "primary"` dipilih untuk target utama;
- supporting/required link hanya bila benar-benar dibutuhkan;
- bobot positif seluruh `ideaLinks` harus berjumlah tepat 1; satu Idea memakai bobot 1. Untuk beberapa Idea, tentukan bagian penalaran yang dinilai tiap Idea, normalkan proporsinya, dan periksa total setelah pembulatan. Jangan memberi link pada konsep yang hanya disebut dalam cerita;
- Idea yang sama tidak boleh muncul dua kali.

Jika MCP masih menerima unlinked question karena kompatibilitas, author preflight harus menolaknya.

## Existing bank dan gap analysis

Sebelum membuat soal untuk satu Idea:

1. `assessment.list_questions` dengan `origin: "zyx_original"` dan filter yang relevan;
2. buka detail yang perlu dibandingkan dengan `assessment.get_question`;
3. gunakan `assessment.analyze_bank` untuk distribusi/coverage agregat bila membantu;
4. catat gap substantif, bukan sekadar jumlah soal.

Gap yang sah antara lain: belum ada target tertentu, cognitive level berbeda, reasoning pattern penting, question type yang sesuai, difficulty yang diperlukan, representasi lain, atau miskonsepsi yang belum diuji.

Perubahan angka/konteks tanpa perubahan target/reasoning bukan gap.

## Batas bukti katalog dan Artikel

`assessment.list_questions` tidak menjamin semua soal target tercakup oleh pencarian judul. Gunakan paging, filter scope/origin, dan detail Idea links untuk kandidat pembanding. Catat filter, halaman terakhir/next offset, dan jumlah detail dibaca. Bila cakupan belum lengkap, sebut “tidak ditemukan duplikat pada kandidat yang diperiksa”, bukan “bank bebas duplikat”. Lanjutkan pemeriksaan yang diperlukan sebelum mengklaim gap di seluruh scope.

`knowledge.list_products`/`knowledge.get_product` dapat membantu menemukan identitas Artikel bila tersedia pada run. Saat skill ini ditulis, detail Artikel hanya mengembalikan metadata dan Idea links, bukan body bacaan. Gunakan artifact Artikel atau resource isi yang benar-benar tersedia untuk alignment; jangan mengarang tool baca Artikel, parameter `includeContent`, atau menyimpulkan coverage isi dari `ideaCount`.

Historical reference yang kosong bukan blocker soal original. Jika referensi tidak tersedia, lanjutkan gap analysis dari Idea dan bank yang terbaca, lalu laporkan lineage kosong. Hentikan hanya bila referensi spesifik memang menjadi prasyarat permintaan.

## Historical reference sebagai konteks read-only

Gunakan `assessment.list_reference_questions { runToken, ideaId, limit: 10 }` untuk discovery per Idea. Batas skill: maksimal 10 hasil list per Idea dan maksimal 5 detail per Idea. Buka detail dengan `assessment.get_reference_question { runToken, questionId }`.

Baca source attribution, answer/solution provenance, Idea links, bentuk soal, dan detail yang diperlukan untuk memahami pola ujian. Historical row tidak boleh diedit melalui `quiz_bank`.

Jika soal original memiliki hubungan nyata ke reference, isi `referenceLinks` pada **draft** sesuai contract aktif dengan role:

- `inspired_by` untuk pengaruh pola/tema umum;
- `adapted_from` untuk struktur masalah yang dekat tetapi menjadi soal original;
- `derived_from` untuk turunan kuat yang membutuhkan lineage eksplisit.

`assessment.update_question` saat ini hanya menerima `question` dan `ideaLinks`; jangan mengarang `referenceLinks` pada tool update. Bila lineage existing question perlu diubah tetapi tool aktif tidak mendukungnya, berhenti dan laporkan batas tool.

Jika operator ingin menyimpan wording historical verbatim, berhenti dan gunakan `$reference-question-ingest`.

## Draft `question-bank-draft.v2`

Envelope draft berisi 1 sampai 500 soal menurut schema saat skill ini ditulis. Jika jumlah melebihi batas aktif, bagi menjadi draft dengan identity berbeda yang stabil, tetap dedup lintas batch, dan laporkan total. Contoh lengkap struktur:

```json
{
  "schemaVersion": "question-bank-draft.v2",
  "draftId": "draft-example-01",
  "questions": [
    {
      "id": "q-example-01",
      "questionType": "multiple_choice",
      "difficulty": "easy",
      "cognitiveLevel": "apply",
      "reasoningPattern": "direct_application",
      "tags": ["pertaksamaan-linear"],
      "prompt": "Selesaikan -2x > 6.",
      "options": ["x > -3", "x < -3", "x < 3", "x > 3"],
      "correctIndices": [1],
      "acceptableAnswers": [],
      "explanation": "Bagi kedua ruas dengan -2. Karena pembaginya negatif, arah pertaksamaan berbalik sehingga x < -3. Nilai x = -4 memberi 8 > 6, sedangkan batas x = -3 tidak memenuhi pertaksamaan ketat. Opsi pertama gagal membalik arah; opsi ketiga salah tanda batas; opsi keempat salah tanda sekaligus arah.",
      "ideaLinks": [
        { "ideaId": "REPLACE_WITH_PUBLISHED_SCOPED_IDEA", "weight": 1, "role": "primary" }
      ],
      "referenceLinks": []
    }
  ]
}
```

Contoh envelope di atas hanya ilustrasi. Ganti identity lokal sesuai aturan idempotency dan placeholder Idea dengan hasil katalog; jangan submit contoh mentah atau memakai topiknya di luar scope. Gunakan `draftJson` berupa serialisasi envelope lengkap, bukan array `questions` saja.

Untuk `short_answer`/`essay`, `options` dan `correctIndices` kosong. Short answer memiliki `acceptableAnswers` yang terverifikasi; essay memakai pembahasan/model jawaban dan tidak mengarang kunci deterministik. Untuk MC/multi-select, `acceptableAnswers` kosong dan indeks harus cocok dengan opsi final.

`workflow.get_contract` dan tool schema aktif menang untuk field/enum aktual.

## Author preflight sebelum MCP

Sebelum `assessment.validate_quiz_draft`, setiap soal wajib lulus checklist `question-quality.md`, termasuk:

- satu target utama;
- Idea link wajib;
- cognitive level/difficulty/type selaras;
- kunci diverifikasi;
- distractor masuk akal;
- tidak semantic duplicate;
- lineage historical jujur;
- explanation lengkap;
- tidak ada internal-ID leak atau fakta tak terlacak.

Jangan memakai MCP validator sebagai first-pass editor.

## Validasi dan submit

`assessment.validate_quiz_draft` mengembalikan blocking issues, warnings, dan stats. Perbaiki blocking issue serta warning substantif. Setelah setiap revisi:

1. ulangi author preflight;
2. validasi ulang;
3. submit hanya jika kedua gate lulus dan operator mengizinkan staging.

`QUESTION_COVERAGE_GAP` adalah sinyal untuk meninjau gap, bukan perintah membuat filler. `QUESTION_EXPLANATION_EMPTY` harus diperlakukan sebagai author failure walau server mengategorikannya warning.

## Pengeditan

`assessment.update_question` hanya untuk `zyx_original` yang editable dalam scope. Jangan edit `historical_reference`, `itb_example`, published/retired item yang ditolak lifecycle, atau item di luar scope. Sebelum update, ambil detail terbaru, jalankan preflight, dan validasi representasi draft revisinya bila tool mendukung. Jangan baru memeriksa isi setelah mutation. Setelah update, baca kembali item untuk mencocokkan field, Idea links, dan reset review status sesuai service.

## Error handling

Ikuti error code MCP. Jangan memperbaiki error scope dengan menebak ID, mengganti identity, atau membuat duplicate row. Token expired → mulai/refresh run sesuai tool. Idea stale/not found → query ulang katalog. Historical reference tidak dapat ditelusuri → jangan mengarang lineage.

## Stop condition

MCP tidak memiliki publication tool. Output submit/update tetap menunggu admin review. `valid`, `generated`, atau `admin_review` bukan `published`.
