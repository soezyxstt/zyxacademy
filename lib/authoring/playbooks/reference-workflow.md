# Zyx Historical Reference Question Ingest: Workflow and Contract Playbook

## 1. Scope and direct publication

Import verbatim historical questions from stored course PDFs through `reference_question_ingest` using `reference-question-draft.v1`. `assessment.submit_reference_draft` directly writes immutable `historical_reference` records with `status: "published"`, `reviewRequired: false` and `publicationTarget: "reference_question_bank"`. Items with `quizEligible: true` become available for quiz assembly. Submit only within explicit authorization to store/publish those historical questions, never as a smoke test.

## 2. Read and prepare

1. Call `workflow.get_playbook` with `skill: "reference-question-ingest"`, `stage: "reference"`, current package metadata and real client capabilities. Read `common/execution`, this module and `reference/payload-preflight`.
2. Resolve `courseKey` through `catalog.list_courses`. Start `workflow: "reference_question_ingest"` with the key and `bootstrapToken`. This is course-only: omit `chapterKey`, `sourcePackId`, `sourcePackImportId` and `sourcePackToken`. Read `workflow.get_contract` with the run/bootstrap and use its returned `runToken`. On drift, refresh bootstrap and contract with the existing run, then revalidate.
3. Use `source.list_reference_files` for stored `soal` and `pembahasan_soal` PDFs. Read every page of the selected question and paired solution PDFs with `source.read_file`, at most 4 pages per call. Use `representation: "both"` for formulas, diagrams, scans or layout. Poll `source.get_read_job` when pending; retry only failed pages with `retryFailed: true`. The download mode is optional for hosts that can read the temporary binary URL.
4. Use the returned opaque file keys in `source.sourceFileKey` and optional `source.solutionFileKey`; do not use raw storage paths or temporary URLs. Copy the exact catalog title. Keys belong in the private tool payload, not the learner content or public report.
5. Find published Ideas using `knowledge.search_course_ideas` and verify selected records with `knowledge.get_idea`. Same-course Ideas across chapters are allowed. Each row needs nonempty links, positive weights summing to 1 within `1e-6` and no duplicate Idea ID.
6. Check `assessment.list_reference_questions` for existing source/locator records. Preserve verbatim text, subpart labels and shared context. Use a unique `localId` and `(questionNumber, part)` per row; `page` is the starting PDF page, numbered from 1. Inspect continuation pages before completing a row.

## 3. Minimal JSON example

This example illustrates structure only. Its opaque keys and Idea ID are synthetic and do not pass source authorization. Replace them, the source metadata and the prompt/answer with observed records and verbatim evidence before validation.

```json
{
  "schemaVersion": "reference-question-draft.v1",
  "source": {
    "sourceFileKey": "synthetic-question-file-key",
    "institution": "Synthetic course",
    "assessmentType": "exercise",
    "title": "Synthetic source title"
  },
  "questions": [
    {
      "localId": "q1",
      "questionNumber": "1",
      "page": 1,
      "prompt": "Tentukan nilai x yang memenuhi 2x + 1 = 7.",
      "questionType": "short_answer",
      "difficulty": "easy",
      "cognitiveLevel": "apply",
      "acceptableAnswers": ["3"],
      "answerProvenance": "official",
      "solutionProvenance": "unavailable",
      "quizEligible": true,
      "ideaLinks": [{ "ideaId": "synthetic-published-idea", "weight": 1, "role": "primary" }]
    }
  ]
}
```

The strict schema accepts only its declared fields. In particular, this payload has no `solutionMarkdown`, `explanation` or `tags`. The source may also declare `solutionFileKey`, `year`, `academicYearLabel` and `term`; the question may declare `part`, `options` and `correctIndices`. Use the current validator for exact types/defaults. Limit each draft to 500 rows and 8 MiB of JSON.

## 4. Provenance and stored solutions

`answerProvenance` and `solutionProvenance` independently use `official`, `source_solution`, `zyx_generated` or `unavailable`. Match the actual origin: printed question-document evidence, the paired solution PDF, independently derived/checked work, or missing evidence. `source_solution` requires the paired stored file. Never relabel evidence merely to pass validation.

The current submission path derives stored explanation text only from the matching numbered span of the paired PDF when `solutionProvenance` is `source_solution`. It does not accept agent-authored solution text in this JSON. Missing or unreadable numbered spans produce no stored explanation; do not paste the full PDF, pretend the extraction succeeded, or switch provenance to hide that limit. Report it and keep unsupported work separate.

Set `quizEligible: true` only for a gradable non-essay question with complete verified answer fields and answer provenance other than `unavailable`. **Every essay must use `quizEligible: false`**, even if its answer or solution is known. Use false for incomplete or unavailable answers. A provenance label or successful schema parse does not verify fidelity or correctness.

## 5. Validate, submit and resume

Complete `reference/payload-preflight`, then call `assessment.validate_reference_draft` with `runToken`, `draftJson` and `bootstrapToken`. Resolve every blocker. Call `assessment.submit_reference_draft` only for the exact reviewed batch covered by the user authorization. Record returned IDs, `unchanged`, publication state and eligibility.

After a lost response, inspect the same source and question locators before replaying unchanged content. A source or question conflict requires reading the existing record; do not change IDs or locators to create a duplicate. Historical records cannot be edited with `assessment.update_question` or Idea/Product revision tools. Admin mutation receipts are not available for this submission protocol.
