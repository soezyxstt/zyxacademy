# Zyx Question Authoring MCP: Workflow and Contract Playbook

## 1. Stage Objective

Author high-quality Zyx-original assessment questions (`origin: "zyx_original"`) linked to published Ideas in a locked course and chapter (`question-bank-draft.v2`), validate and stage them via MCP, update draft questions when needed, and optionally assemble or update course/chapter quizzes (`quiz.*`).

## 2. Step-by-Step Tool Sequence

1. **Bootstrap:** Call `workflow.get_playbook` with `skill: "zyx-question-authoring-mcp"`, `stage: "quiz"`, and client metadata. Save `bootstrapToken`.
2. **Lock Scope and Start Run:**
   - Call `catalog.list_courses` and `catalog.list_chapters` to obtain `courseKey` and `chapterKey`.
   - Call `workflow.start` with `workflow: "quiz_bank"`, `courseKey`, `chapterKey`, optional `sourcePackId` / `sourcePackToken`, and `bootstrapToken`.
   - Call `workflow.get_contract` with `runToken` and `bootstrapToken`.
   - Read `outputs.quizDraft.visualAuthoring` and its checksum-pinned visual schema before writing a `zyx-visual` fence in a prompt, option, or explanation. Use the current typed scene examples and validator; do not put solution-only states or labels in prompts or options. Keep answers and solution visuals in their authorized assessment fields.
3. **Inspect Published Ideas and Existing Question Bank:**
   - Call `assessment.list_ideas` with `runToken` (supports `query`, `knowledgeKinds`, `instructionalRoles`, `difficultyLevels`, `limit`, `offset`) to load the published Idea catalog and facets.
   - Call `assessment.get_idea` for specific Ideas to inspect incoming/outgoing prerequisite relations and provenance.
   - Call `assessment.analyze_bank` and `assessment.list_questions` (`runToken`) to identify uncovered Ideas (`uncoveredIdeas`), difficulty/cognitive balance, and existing questions so you do not write duplicates.
4. **Bounded Historical Reference Gap Analysis (Optional):**
   - To see how historical exams tested a specific Idea, call `assessment.list_reference_questions` with `runToken`, `ideaId`, and `limit` up to `10` (maximum 10 per Idea).
   - Call `assessment.get_reference_question` for at most `5` relevant reference questions per Idea.
   - Use historical reference questions strictly for gap analysis and calibration. Never copy historical questions verbatim into `quiz_bank`. When a new Zyx-original question is inspired by or adapted from a historical question, record `referenceLinks` with `role: "inspired_by" | "adapted_from" | "derived_from"`.
5. **Draft, Validate, and Submit `question-bank-draft.v2`:**
   - Construct the `question-bank-draft.v2` JSON string following the schema below and the quality rules in `quiz/quality`.
   - For `interactive_document`, keep only its metadata in a `zyx-visual` fence. Pass `visualAssets` separately to validation and submission, and to `assessment.update_question` for new or changed visuals: an array of `{ path, sha256, bytes, base64 }`, one entry per unique `visuals/<sha256>.html` and `visuals/<sha256>.png`. The base64 must encode the exact HTML or PNG bytes. An update retaining only previously bound specs can omit the envelope and reuse verified original assets. Otherwise supply all referenced assets, with no orphans; the format limit is eight visual specs and 16 MiB total, with at most 6 MiB per HTML and 2 MiB per PNG. Provider and MCP transport capacity is not established by these limits. Never share either asset hash between visible prompt/options and hidden explanation, including across questions in the batch. Keep solution content only in explanation assets.
   - `scripts/authoring/package-interactive-document.ts` shows a runnable local command for a reviewed pair, including the metadata fence and `visualAssets`. Obtain the live contract and author the question separately; the script does not approve it.
   - Call `assessment.validate_quiz_draft` with `runToken`, `draftJson`, and `bootstrapToken`.
   - Fix all blocking issues and address coverage/explanation warnings until `ok: true` and `valid: true`.
   - Call `assessment.submit_quiz_draft` with `runToken`, `draftJson`, and `bootstrapToken` (`authoring:stage`).
6. **Editing Existing Draft Questions (`assessment.update_question`):**
   - To revise an existing un-published Zyx-original question in the locked chapter, call `assessment.update_question` with `runToken`, `questionId`, `question`, `ideaLinks`, and `bootstrapToken`.
   - Apply the same published Idea, locked scope, exactly one primary, uniqueness, and weight rules as draft submission.
   - Only `zyx_original` questions in `draft` or `in_review` status can be updated (`reviewStatus` resets to `generated`). Historical reference questions, ITB examples, and `published` or `retired` questions are immutable in this tool.
7. **Quiz Assembly (`quiz.*`, when requested by operator):**
   - `quiz.list` (`courseKey`, optional `category`, `status`) and `quiz.get` (`quizId`) inspect existing quizzes.
   - `quiz.create` (`courseKey`, `title`, `questionIds`, optional `chapterKey`, `category`, `timeLimitSeconds`, `maxAttempts`, `visibility`, `status: "draft" | "published"`, `manualStatus`, `passingScore`, `runToken`, `bootstrapToken`) creates a quiz and syncs `item_asesmen`.
   - `quiz.update` and `quiz.set_questions` update quiz metadata or question lists (pass `bootstrapToken` when available).

## 3. `question-bank-draft.v2` JSON Contract

```json
{
  "schemaVersion": "question-bank-draft.v2",
  "draftId": "draft-ma1101-bab01-limit-01",
  "questions": [
    {
      "id": "q-limit-001",
      "questionType": "multiple_choice",
      "difficulty": "medium",
      "cognitiveLevel": "apply",
      "reasoningPattern": "algebraic_factorization_and_domain_check",
      "tags": ["limit-aljabar", "bentuk-tak-tentu"],
      "prompt": "Hitung nilai dari $\\lim_{x \\to 3} \\frac{x^2 - 9}{x - 3}$.",
      "options": [
        "$0$",
        "$3$",
        "$6$",
        "Tidak ada",
        "$9$"
      ],
      "correctIndices": [2],
      "acceptableAnswers": [],
      "explanation": "Karena $x \\to 3$ berarti $x \\neq 3$, kita dapat memfaktorkan pembilang: $\\frac{(x - 3)(x + 3)}{x - 3} = x + 3$. Substitusi $x = 3$ menghasilkan $3 + 3 = 6$. Opsi A salah karena menganggap pembilang nol saja, dan opsi D salah karena mengira pembagian dengan nol di $x = 3$ menggagalkan limit.",
      "ideaLinks": [
        {
          "ideaId": "<published-idea-id>",
          "weight": 1,
          "role": "primary"
        }
      ],
      "referenceLinks": [
        {
          "referenceQuestionId": "<historical-reference-question-id>",
          "role": "inspired_by"
        }
      ]
    }
  ]
}
```

### 3.1 Field Rules and Invariants

- `questionType`: `"multiple_choice" | "multiple_choices" | "short_answer" | "essay"`
  - `multiple_choice`: `options` must have at least 2 choices (standard 4 or 5) and `correctIndices` must have exactly 1 valid index.
  - `multiple_choices`: `options` must have at least 2 choices and `correctIndices` must have 1 or more distinct valid indices.
  - `short_answer`: `options` is `[]`, `correctIndices` is `[]`, and `acceptableAnswers` must contain at least 1 canonical answer string (include equivalent forms if applicable).
  - `essay`: `options` is `[]`, `correctIndices` is `[]`, and `explanation` must provide the full grading rubric and step-by-step model solution.
- `difficulty`: `"easy" | "medium" | "hard"`
- `cognitiveLevel`: `"remember" | "understand" | "apply" | "analyze" | "evaluate" | "create"`
- `ideaLinks`: Required non-empty array on every new or updated question. Empty or missing links are rejected; legacy V1 drafts must be migrated to V2 with explicit Idea links. Exactly one link must have `role: "primary"`:
  - Every `ideaId` must be `published` and belong to the locked `courseId` and `chapterId`.
  - No duplicate `ideaId` within the same question.
  - Positive `weight` values (`0 < weight <= 1`) must sum to `1` (`Math.abs(sum - 1) <= 1e-6`).
  - `role`: `"primary" | "supporting" | "required"`.
- `referenceLinks`: Optional array of `{ referenceQuestionId, role: "inspired_by" | "adapted_from" | "derived_from" }`. Every target must be an existing `historical_reference` question in the same course.
