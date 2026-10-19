# Zyx Historical Reference Question Ingest: Workflow and Contract Playbook

## 1. Stage Objective and Publication Semantics

Extract historical exam, quiz, tutorial, or homework questions (`origin: "historical_reference"`) from stored course PDFs into `reference-question-draft.v1`, link each question to published Ideas in the same course, validate fidelity and provenance, and submit via `assessment.submit_reference_draft`.

**Important Publication Rule:** Unlike `idea_product` and `quiz_bank`, `assessment.submit_reference_draft` writes validated historical reference questions directly with `status: "published"` (`reviewRequired: false`, `publicationTarget: "reference_question_bank"`). Any question with `quizEligible: true` becomes immediately eligible for quiz assembly. Therefore, verbatim source fidelity and provenance accuracy are mandatory before calling submit.

## 2. Step-by-Step Tool Sequence

1. **Bootstrap:** Call `workflow.get_playbook` with `skill: "reference-question-ingest"`, `stage: "reference"`, and client metadata. Save `bootstrapToken`.
2. **Lock Course Scope (Course-Only Workflow):**
   - Call `catalog.list_courses` to obtain `courseKey`.
   - Call `workflow.start` with `workflow: "reference_question_ingest"`, `courseKey`, and `bootstrapToken`.
   - **Do NOT pass `chapterKey` or `sourcePackToken`:** `reference_question_ingest` runs at course scope across all chapters and rejects chapter/Source Pack parameters (`WORKFLOW_SCOPE_INVALID`).
   - Call `workflow.get_contract` with `runToken` and `bootstrapToken`.
3. **List and Read Stored Historical PDFs:**
   - Call `source.list_reference_files` with `runToken` and optional `categories: ["soal", "pembahasan_soal"]`.
   - Read every page of the target question PDF (`sourceFileKey`) and, when available, the matching solution PDF (`solutionFileKey`) using `source.read_file` (`mode: "pages"`, up to 4 pages per call).
4. **Search Published Course Ideas Across Chapters:**
   - Call `knowledge.search_course_ideas` with `runToken` and `query` to find published Ideas across all chapters of the locked course.
   - Call `knowledge.get_idea` with `runToken` and `ideaId` to verify the exact Idea statement and chapter context before linking.
   - Every historical question requires at least one published Idea link from the same course (`ideaLinksRequired: true`, `sameCourseAcrossChaptersAllowed: true`), with positive weights summing to `1`.
5. **Inspect Existing Historical Questions (Avoid Duplicates):**
   - Call `assessment.list_reference_questions` with `runToken` (filtered by `year`, `assessmentType`, `institution`, or `query`) to check what has already been ingested.
6. **Build, Validate, and Submit `reference-question-draft.v1`:**
   - Construct `draftJson` following the schema below and the preflight checklist in `reference/payload-preflight`.
   - Call `assessment.validate_reference_draft` with `runToken`, `draftJson`, and `bootstrapToken`.
   - Resolve every blocking issue until `ok: true` and `valid: true`.
   - Call `assessment.submit_reference_draft` with `runToken`, `draftJson`, and `bootstrapToken` (`authoring:stage`).

## 3. `reference-question-draft.v1` JSON Contract

```json
{
  "schemaVersion": "reference-question-draft.v1",
  "source": {
    "sourceFileKey": "<encrypted-fileKey-from-source.list_reference_files>",
    "solutionFileKey": "<optional-encrypted-fileKey-for-pembahasan_soal>",
    "title": "UTS I MA1101 Matematika IA 2023/2024",
    "institution": "ITB",
    "assessmentType": "uts",
    "year": 2023,
    "academicYearLabel": "2023/2024",
    "term": "ganjil"
  },
  "questions": [
    {
      "localId": "uts-2023-q1a",
      "questionNumber": "1",
      "part": "a",
      "page": 1,
      "questionType": "essay",
      "difficulty": "medium",
      "cognitiveLevel": "apply",
      "prompt": "Tentukan nilai $\\lim_{x \\to 0} \\frac{\\sin(3x)}{x}$.",
      "options": [],
      "correctIndices": [],
      "acceptableAnswers": ["3"],
      "answerProvenance": "source_solution",
      "solutionProvenance": "source_solution",
      "solutionMarkdown": "Menggunakan sifat limit trigonometri dasar, $\\lim_{x \\to 0} \\frac{\\sin(3x)}{3x} \\cdot 3 = 1 \\cdot 3 = 3$.",
      "quizEligible": true,
      "ideaLinks": [
        {
          "ideaId": "<published-idea-id-in-same-course>",
          "weight": 1,
          "role": "primary"
        }
      ],
      "tags": ["uts-2023", "limit-trigonometri"]
    }
  ]
}
```

### 3.1 Provenance and `quizEligible` Rules

- `assessmentType`: `"uts" | "uas" | "quiz" | "tutorial" | "homework" | "exercise" | "other"`
- `answerProvenance` and `solutionProvenance`:
  - `"official"`: Answer key or rubric is printed directly in the official exam/question document (`sourceFileKey`).
  - `"source_solution"`: Answer or solution comes from a paired stored solution document (`solutionFileKey` must be provided and match the numbered solution span).
  - `"zyx_generated"`: The source PDF has no official answer/solution, and the answer/solution was derived and verified by Zyx authoring.
  - `"unavailable"`: No answer or solution is provided.
- `quizEligible` Gate:
  - Set `quizEligible: true` only when the question has a verified answer (`correctIndices` for MC/multi-MC, `acceptableAnswers` for short answer, or complete verified solution/answer for essay according to validator rules) and `answerProvenance !== "unavailable"`.
  - If `answerProvenance === "unavailable"`, `quizEligible` must be `false`.
