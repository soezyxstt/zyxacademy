# Zyx Question Authoring MCP: Workflow and Contract Playbook

## 1. Stage Objective

Author high-quality Zyx-original assessment questions (`origin: "zyx_original"`) linked to published Ideas in a locked course and chapter (`question-bank-draft.v2`), validate and stage them via MCP, update draft questions when needed, and optionally assemble or update course/chapter quizzes (`quiz.*`).

## 2. Step-by-Step Tool Sequence

1. **Bootstrap:** Call `workflow.get_playbook` with `skill: "zyx-question-authoring-mcp"`, `stage: "quiz"`, and client metadata. Save `bootstrapToken`.
2. **Lock Scope and Start Run:**
   - Call `catalog.list_courses` and `catalog.list_chapters` to obtain `courseKey` and `chapterKey`.
   - Call `workflow.start` with `workflow: "quiz_bank"`, `courseKey`, `chapterKey`, optional `sourcePackId` / `sourcePackToken`, and `bootstrapToken`.
   - Call `workflow.get_contract` with `runToken` and `bootstrapToken`.
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
   - Call `assessment.validate_quiz_draft` with `runToken`, `draftJson`, and `bootstrapToken`.
   - Fix all blocking issues and address coverage/explanation warnings until `ok: true` and `valid: true`.
   - Call `assessment.submit_quiz_draft` with `runToken`, `draftJson`, and `bootstrapToken` (`authoring:stage`).
6. **Editing Existing Draft Questions (`assessment.update_question`):**
   - To revise an existing un-published Zyx-original question in the locked chapter, call `assessment.update_question` with `runToken`, `questionId`, `question`, `ideaLinks`, and `bootstrapToken`.
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
- `ideaLinks`: Optional array (`[]` allowed), but strongly recommended so every catalog Idea is covered. When `ideaLinks` is non-empty:
  - Every `ideaId` must be `published` and belong to the locked `courseId` and `chapterId`.
  - No duplicate `ideaId` within the same question.
  - Positive `weight` values (`0 < weight <= 1`) must sum to `1` (`Math.abs(sum - 1) <= 1e-6`).
  - `role`: `"primary" | "supporting" | "required"`.
- `referenceLinks`: Optional array of `{ referenceQuestionId, role: "inspired_by" | "adapted_from" | "derived_from" }`. Every target must be an existing `historical_reference` question in the same course.
