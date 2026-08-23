# Question authoring MCP reference

## Host setup

Endpoint MCP: `https://staging.zyxacademy.com/api/mcp/authoring`

- Claude Desktop atau Claude Code: pasang plugin `zyx-authoring-mcp` yang membawa `.mcp.json` dan skills, atau tambah remote connector dengan URL di atas. OAuth admin Zyx dibuka otomatis pada host yang mendukung.
- ChatGPT: aktifkan Developer mode pada Settings, tambah connector bertipe MCP dengan URL di atas, lalu autentikasi lewat OAuth. Jika host tidak mendukung OAuth interaktif, minta admin Zyx membuat connection token singkat lewat `POST /api/mcp/authoring/connection` saat sesi admin aktif dan gunakan sebagai Bearer token. Tempel isi SKILL.md ke instructions custom GPT atau project agar alur tool dipatuhi; buang frontmatter YAML karena hanya dibutuhkan loader skill Claude, dan ganti tautan `references/workflow.md` pada langkah pertama dengan file ini bila ikut ditempel.
- Jangan pernah menyimpan connection token di file konfigurasi atau repositori.

## Tool sequence

```text
workflow.list
catalog.list_courses
catalog.list_chapters { courseKey }
workflow.start { workflow: "quiz_bank", courseKey, chapterKey }
workflow.get_contract { runToken }
assessment.list_ideas { runToken, query?, knowledgeKinds?, instructionalRoles?, difficultyLevels?, limit?, offset? }
assessment.get_idea { runToken, ideaId }
assessment.validate_quiz_draft { runToken, draftJson }   // ulangi sampai valid
assessment.submit_quiz_draft { runToken, draftJson }     // butuh scope authoring:stage
```

`workflow.start` tanpa `sourcePackToken` sah untuk quiz_bank. Dengan Source Pack opsional, jalankan `source.ingest` lebih dulu lalu sertakan `sourcePackToken`.

## Katalog Idea

Respons `assessment.list_ideas` memuat:

- `scope`: label mata kuliah dan bab yang dikunci.
- `totalIdeaCount` dan `ideaCount`: total published di scope dan jumlah hasil filter.
- `ideas`: halaman berisi id, code, statement, explanation, latex, knowledgeKind, instructionalRole, difficultyLevel, version, semanticHash.
- `facets`: hitungan per knowledgeKind, instructionalRole, dan difficultyLevel untuk menyaring iterasi berikutnya.
- `paging.nextOffset`: kirim sebagai `offset` berikutnya bila tidak null.

Filter bersifat kombinasi DAN. Gunakan `query` untuk kata kunci teks bebas atas code, statement, explanation, dan latex.

`assessment.get_idea` menambahkan relations aktif (arah outgoing dan incoming beserta code Idea pasangan) dan ringkasan provenance. Manfaatkan relasi prerequisite untuk memastikan soal tidak menuntut Ide yang belum diajarkan.

## Draft contract

Schema `question-bank-draft.v2`, maksimal 500 soal:

```json
{
  "schemaVersion": "question-bank-draft.v2",
  "draftId": "draft-2026-08-21-kalkulus-bab1",
  "questions": [
    {
      "id": "q-limit-01",
      "questionType": "multiple_choice",
      "difficulty": "medium",
      "cognitiveLevel": "apply",
      "reasoningPattern": "direct_application",
      "tags": ["limit-barisan"],
      "prompt": "Teks pertanyaan.",
      "options": ["Opsi A", "Opsi B", "Opsi C", "Opsi D"],
      "correctIndices": [1],
      "acceptableAnswers": [],
      "explanation": "Pembahasan lengkap.",
      "ideaLinks": [
        { "ideaId": "<dari katalog>", "weight": 0.7, "role": "primary" },
        { "ideaId": "<dari katalog>", "weight": 0.3, "role": "supporting" }
      ]
    }
  ]
}
```

Nilai yang diizinkan:

| Field | Nilai |
|---|---|
| questionType | multiple_choice, multiple_choices, short_answer, essay |
| difficulty | easy, medium, hard |
| cognitiveLevel | remember, understand, apply, analyze, evaluate, create |
| ideaLinks[].role | primary, supporting, required |
| tags | string singkat huruf kecil, konsisten antar soal |

Aturan tautan:

1. Tautan bersifat opsional tetapi sangat disarankan; soal tanpa tautan tetap valid.
2. Bobot positif semua ideaLinks satu soal harus berjumlah tepat 1.
3. Idea wajib published, satu mata kuliah, dan satu bab dengan run.
4. Satu Idea tidak boleh muncul dua kali pada soal yang sama.

## Validasi dan submit

`assessment.validate_quiz_draft` mengembalikan seluruh temuan dalam satu panggilan, bukan satu per satu:

- `issues`: blocking, wajib nol sebelum submit.
- `warnings`: misalnya QUESTION_COVERAGE_GAP untuk Idea belum tercover dan QUESTION_EXPLANATION_EMPTY.
- `stats`: distribusi difficulty, cognitive level, question type, frekuensi tag, dan coverage per Idea.

Perbaiki draft, validasi ulang, lalu submit. Respons submit memuat `createdCount`, `existingCount`, `questionIds`, warnings tersisa, dan `next: "admin_review"`. Tidak ada tool MCP yang dapat publish; publikasi hanya oleh admin.

## Error codes dan tindakan

| Code | Arti | Tindakan |
|---|---|---|
| AUTHORING_MCP_WORKFLOW_MISMATCH | Run bukan quiz_bank | Mulai run baru dengan workflow quiz_bank |
| AUTHORING_MCP_IDEA_NOT_IN_SCOPE | Idea tidak published atau di luar scope | Pilih ulang dari assessment.list_ideas |
| QUESTION_BANK_DRAFT_DUPLICATE_ID | ID soal ganda dalam draft | Beri ID unik per soal |
| QUESTION_AUTHORING_INVALID_QUESTION | Struktur soal tidak lengkap | Ikuti pesan, misal opsi minimal dua |
| QUESTION_AUTHORING_DUPLICATE_ANSWER | Kunci jawaban ganda | Satu indeks unik untuk multiple_choice |
| QUESTION_AUTHORING_DUPLICATE_IDEA | Idea sama dua kali di satu soal | Hapus duplikat |
| QUESTION_AUTHORING_IDEA_WEIGHT_INVALID | Total bobot bukan 1 | Normalisasi bobot positif menjadi 1 |
| QUESTION_AUTHORING_IDEA_NOT_FOUND | ideaId tidak ada | Salin ulang dari katalog terbaru |
| QUESTION_AUTHORING_IDEA_NOT_PUBLISHED | Idea belum published | Ganti Idea published lain |
| QUESTION_AUTHORING_IDEA_COURSE_MISMATCH | Idea beda mata kuliah | Ganti dari katalog scope |
| QUESTION_AUTHORING_IDEA_CHAPTER_MISMATCH | Idea beda bab | Ganti dari katalog scope |
| AUTHORING_MCP_TOKEN_EXPIRED | Run token kedaluwarsa (7 hari) | workflow.start ulang |
| AUTHORING_MCP_SCOPE_REQUIRED | Scope token kurang | Minta koneksi dengan authoring:stage untuk submit |

Draft yang sudah staged berstatus generated dan ditinjau admin di alur review bank soal.
