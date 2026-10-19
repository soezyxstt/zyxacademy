# Zyx Historical Reference Question Ingest: Payload Preflight and Verbatim Fidelity Checklist

## 1. Strict Verbatim Fidelity Rules

Historical reference questions represent archival academic assessments. Unlike `quiz_bank`, you are recording what was actually asked on a historical exam or problem set:

1. **Do Not Rewrite or Modernize Wording:**
   - Keep the exact wording, language, numbers, functions, and context of `prompt` and `options` from the source PDF.
   - Normalize only whitespace, Markdown line breaks, and LaTeX math syntax (`$...$`, `$$...$$`) that do not alter meaning.
2. **Do Not Invent or Alter Questions:**
   - Never change numbers, add extra sub-parts, or "fix" what you suspect is a typo in the original exam question without preserving the literal text (if a source question is genuinely broken or illegible, flag it to the operator instead of silently rewriting it).
3. **Accurate Locator Metadata:**
   - `questionNumber`: Exact question number string as printed in the PDF (for example, `"1"`, `"2"`, `"II.3"`).
   - `part`: Exact sub-part letter or label when a numbered question has parts (for example, `"a"`, `"b"`, `"i"`, or `null` when there are no sub-parts). Split multi-part questions (`1(a)`, `1(b)`) into separate entries in `questions` with shared stem context included in each `prompt` so each entry is self-contained.
   - `page`: Positive 1-indexed PDF page number where the question appears in `sourceFileKey` (`1 <= page <= source.pageCount`).

## 2. Solution Extraction and Isolation Rules

When `solutionProvenance: "source_solution"` is used:
1. `source.solutionFileKey` must be provided and must come from `source.list_reference_files` for the same course.
2. Ensure the solution text corresponds only to that specific `(questionNumber, part)`. Never paste the entire solution PDF text into a single question's solution, because doing so would leak answers to other questions in the exam.
3. Notice that server-side `extractHistoricalSolutionSpan` in `lib/question-authoring.ts` matches numbered solution markers (`Soal 1`, `1(a)`, `1(b)`) in the extracted text of `solutionFileKey`. When the solution PDF has no machine-parseable numbered marker or when you provide a Zyx-authored walkthrough for an exam that only had a bare answer key, set `solutionProvenance` accurately (`"zyx_generated"` or `"official"`) so provenance validation matches the stored document evidence.

## 3. Idea Linking Across Chapters

1. Every question in `questions` must have a non-empty `ideaLinks` array.
2. All `ideaId` values must be `published` Ideas belonging to the locked course (discovered via `knowledge.search_course_ideas` and verified via `knowledge.get_idea`).
3. Unlike chapter-locked `quiz_bank`, a historical exam (such as UTS or UAS) spans multiple chapters; `ideaLinks` in `reference_question_ingest` may reference published Ideas from any chapter within the same course.
4. For each question, `ideaLinks` weights must be positive (`> 0`) and sum to `1` (`Math.abs(sum - 1) <= 1e-6`), with no duplicate `ideaId` on the same question.

## 4. Pre-Submit Preflight Checklist

Before calling `assessment.validate_reference_draft` and `assessment.submit_reference_draft`, verify every item below:
- [ ] `schemaVersion` is `"reference-question-draft.v1"`.
- [ ] `source.sourceFileKey` is a fresh key from `source.list_reference_files` in the active course run.
- [ ] Every `localId` is unique within `questions`.
- [ ] Every `(questionNumber, part)` pair is unique within the draft batch.
- [ ] Every `page` is within `1..pageCount` of the source PDF.
- [ ] `questionType` matches `options`, `correctIndices`, and `acceptableAnswers` rules.
- [ ] `answerProvenance` and `solutionProvenance` match the actual evidence in `sourceFileKey` and `solutionFileKey`.
- [ ] `quizEligible` is `false` whenever `answerProvenance === "unavailable"` or the answer is incomplete.
- [ ] Every question has at least one published same-course Idea in `ideaLinks` with weights summing to `1`.
- [ ] All LaTeX expressions have balanced delimiters and no raw internal IDs appear in `prompt`, `options`, or `solutionMarkdown`.
