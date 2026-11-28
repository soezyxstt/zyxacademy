# Zyx Question Authoring MCP: Workflow and Contract Playbook

## 1. Scope and bootstrap

Author `zyx_original` questions for a locked course and chapter using `question-bank-draft.v2`. This workflow stages original questions for review; it does not publish them. Historical references are read-only inputs for analysis, and Idea/Product bundle revision tools do not edit assessment questions.

1. Call `workflow.get_playbook` with `skill: "zyx-question-authoring-mcp"`, `stage: "quiz"`, current package metadata and truthful client capabilities. Read `common/execution`, this module and `quiz/quality`.
2. Resolve human course/chapter names through `catalog.list_courses` and `catalog.list_chapters`. Call `workflow.start` with `workflow: "quiz_bank"`, the selected keys and `bootstrapToken`. A Source Pack is optional; do not create one merely to edit a stored question.
3. Read `workflow.get_contract` with `runToken` and `bootstrapToken`. Use `outputs.quizDraft`, its `draftExample` and the registered tool schemas. Keep the returned run token. On playbook/contract drift, obtain a fresh bootstrap and call the contract tool with the existing run; use its replacement `runToken`, reconcile and validate again. Follow `common/execution` for expired or unbound legacy runs.

## 2. Choose the gap before writing

- Use filtered, paginated `assessment.list_ideas`; read selected `assessment.get_idea` records for their meaning, prerequisite relations and provenance.
- Use `assessment.analyze_bank` and `assessment.list_questions` to find uncovered Ideas, difficulty/cognitive gaps and duplicates. Read `assessment.get_question` before revising a stored question.
- For historical calibration, use `assessment.list_reference_questions` with an Idea and at most 10 results, then at most 5 relevant `assessment.get_reference_question` details per Idea. Do not copy a historical prompt verbatim into this workflow. Record justified `referenceLinks` with `inspired_by`, `adapted_from` or `derived_from` when applicable.
- Solve each new question and check assumptions, answer keys and distractor reasoning before server validation. `quiz/quality` remains authoritative for teaching quality; a schema pass is not a correctness review.

## 3. Draft and answer rules

Send one `draftJson` string shaped as `question-bank-draft.v2`, with a stable `draftId` and stable IDs in `questions`. Use the current `outputs.quizDraft.draftExample`; do not reconstruct Product manifests, hashes, draftKey or admin mutation controls. The server accepts at most 500 questions per draft and 8 MiB of draft JSON. Use smaller focused batches when easier to review.

Every question requires published Ideas in the locked course and chapter, without duplicate IDs, exactly one `primary`, and positive weights summing to 1 within `1e-6`. Other link roles are `supporting` and `required`. The server checks live scope and publication state again; drafts or unpublished Idea replacements cannot satisfy the link.

| `questionType` | Answer fields |
| --- | --- |
| `multiple_choice` | At least 2 options and exactly 1 valid zero-based `correctIndices` entry. |
| `multiple_choices` | At least 2 options and one or more distinct valid zero-based indices. |
| `short_answer` | Empty options/indices and at least 1 canonical `acceptableAnswers` value. |
| `essay` | Empty options/indices and a complete model solution plus grading rubric in `explanation`. |

Use the difficulty and cognitive-level enums from the active contract. Include a full explanation of the governing Idea, solution steps and relevant distractor errors. Keep internal IDs and source filenames out of learner-visible text. Reference links point only to same-course historical records.

## 4. Visuals when needed

Read `outputs.quizDraft.visualAuthoring` and its checksum-pinned visual schema. Use typed `zyx-visual` data, with solution-only labels and states confined to the explanation.

For `interactive_document`, pass metadata in the fence and `visualAssets` separately to validation/submission or updates with new or changed visuals. Supply one `{ path, sha256, bytes, base64 }` entry per unique referenced HTML/PNG, with exact bytes and no orphan assets. The contract permits at most 8 specs and 16 MiB total, at most 6 MiB per HTML and 2 MiB per PNG; these limits do not establish host transport capacity. Never reuse an asset hash across visible prompt/options and hidden explanations, including across questions in the batch. An unchanged bound spec may reuse its verified original assets.

`scripts/authoring/package-interactive-document.ts` can package a reviewed local pair; it does not author or approve the question.

## 5. Validate, stage, edit and recover

Call `assessment.validate_quiz_draft` with `runToken`, `draftJson`, `bootstrapToken` and assets when required. Resolve blocking issues and inspect relevant warnings, then call `assessment.submit_quiz_draft` with the same reviewed content under `authoring:stage` and the existing task authorization. Record returned question IDs and actual counts/status.

Submission uses stable question identity within the run. If its response is lost, read the bank before replaying the unchanged run, IDs and content; never change IDs to bypass a conflict. For an intended edit, call `assessment.update_question` with `questionId`, `question`, `ideaLinks`, active tokens and assets when needed. Only `zyx_original` questions in `draft` or `in_review` may be updated; review resets to `generated`. Published, retired and historical records remain immutable in this tool. Do not invent `expectedRevision` or admin `requestKey` fields for it.

Validation and staging do not authorize publication. Original questions require the available Admin review/publication path. If quiz assembly is separately requested, use `quiz.list`/`quiz.get` before `quiz.create`, `quiz.update` or `quiz.set_questions`, with their actual schemas and bootstrap requirements. Explicit container status `draft` or `published` must match user authorization and does not bypass question eligibility.

## 6. Fast modular quiz and tryout workflow (Assessment UI-SDK)

For low-friction creation and per-question updates of quizzes (`quizTemplates` + `aiQuestionBank`) and tryouts (`exams` + `questions`), use the 4 modular tools directly without multi-stage verification ceremonies or resending unchanged questions:

| Tool | Scope | Purpose |
| --- | --- | --- |
| `authoring.upsert_assessment` | `authoring:stage` | Create or update a quiz or tryout in one call (`courseId`, `kind: "quiz" \| "tryout"`, optional `id`, `title`, `status`, `category`/`settings`, and optional inline `questions`). Returns compact `{ id, kind, title, status, questionCount, questionIds }`. |
| `authoring.list_assessment_questions` | `authoring:read` | Inspect concise question previews (`id`, `order`, `type`, `promptPreview`, `hasExplanation`, `hasExplanationUi`, `hasPromptUi`). Set `includeFull: true` only when full question payloads or UI blocks are needed. |
| `authoring.upsert_question` | `authoring:stage` | Create or update a single quiz question (with optional `quizTemplateId` attachment) or tryout question (`examId`). Accepts plain markdown `prompt`/`explanation` and/or structured `promptUi`/`explanationUi`. If only UI spec is provided, plain markdown fallback is derived automatically. |
| `authoring.update_question_explanation` | `authoring:stage` | Update or patch ONLY a single question's explanation by `questionId` (`kind` auto-detected if omitted). Never touches `prompt`, `options`, `correctIndices`, or other questions. |

### Assessment UI-SDK v1 block catalog (`promptUi` and `explanationUi`)

Each spec has `{ version: 1, layout?: "standard" | "compact", blocks: [...] }`. Block `id` values are optional on input and deterministic when omitted:

- `markdown`: `{ id?, type: "markdown", content }`
- `steps`: `{ id?, type: "steps", title?, collapsible?, steps: [{ id?, title, summary?, blocks }] }` (optional; include only when multi-step breakdown helps)
- `collapsible`: `{ id?, type: "collapsible", title, defaultOpen?, variant?: "hint" | "derivation" | "detail" | "note", blocks }` (optional; include only when collapsible detail helps)
- `callout`: `{ id?, type: "callout", tone: "info" | "tip" | "warning" | "formula" | "mistake", title?, content }`
- `image`: `{ id?, type: "image", src, alt, caption?, aspect?: "auto" | "video" | "square" }`
- `graph`: `{ id?, type: "graph", title?, caption?, spec }` (2D interactive graph)
- `scene_3d`: `{ id?, type: "scene_3d", title?, caption?, spec }` (3D interactive scene)
- `interactive_visual`: `{ id?, type: "interactive_visual", title?, caption?, kind: "canvas" | "document" | "chart" | "flowchart", spec }`
- `formula_card`: `{ id?, type: "formula_card", title?, latex, note? }`

### Modular explanation patches (`authoring.update_question_explanation`)

Pass `patch` (or `patches` array) to edit an existing `explanationUi` without resending the whole explanation:

- `replace_all`: `{ op: "replace_all", spec }`
- `upsert_block`: `{ op: "upsert_block", block, afterBlockId? }`
- `remove_block`: `{ op: "remove_block", blockId }`
- `upsert_step`: `{ op: "upsert_step", stepsBlockId, step, afterStepId? }`
- `remove_step`: `{ op: "remove_step", stepsBlockId, stepId }`
