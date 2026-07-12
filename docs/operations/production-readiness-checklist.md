# Zyx Production Readiness Checklist

This document is the official release gate and operational checklist for onboarding and publishing courses in the Zyx Academy production environment. It must be completed and signed off for every new course release.

---

## 1. Bundle Validation

Before importing a course bundle JSON file, verify its integrity.

* [ ] **Schema Version**: Verify `metadata.schemaVersion` is exactly `"1.1.1"`.
* [ ] **Duplicate IDs**: Ensure that every `$id` attribute (for chapters, concepts, KOs, etc.) is unique across the entire bundle.
* [ ] **Broken References**:
  * [ ] Verify every `concept$ref` in `knowledgeObjects` resolves to a valid concept `$id` in the same chapter.
  * [ ] Verify every `ko$ref` in `flashcards` resolves to a valid KO `$id` in the same chapter.
  * [ ] Verify every `sourceKo$ref` and `targetKo$ref` in `knowledgeRelationships` resolves to valid KO `$id`s.
* [ ] **Chapter Mappings**: Check that all chapters are declared with `$id` values if referenced by assessment sources.
* [ ] **Assessment Mappings**: Verify that `assessmentSources.chapters` contains only valid chapter `$id`s or chapter titles defined in the course.
* [ ] **Relationship Targets**: Ensure there are no cyclic prerequisites (e.g. A depends on B, and B depends on A).

---

## 2. Import Validation

Run the importer script ([import-bundle.ts](../../scripts/import-bundle.ts)) and check the console output and logs.

* [ ] **Import Success**: The script exits with status `0` and prints `Import process completed successfully!`.
* [ ] **Transaction Success**: Ensure the transaction commits successfully and does not roll back due to unique constraints or constraint violations.
* [ ] **Expected Entity Counts**: Check that the console printout matches your expected counts:
  * [ ] Number of Chapters imported
  * [ ] Number of KOs imported
  * [ ] Number of Flashcards imported
  * [ ] Number of Assessment Sources and Objects imported
* [ ] **No FK Violations**: The database log shows zero Foreign Key or schema violation errors.
* [ ] **No Validation Warnings**: Address any importer warnings regarding duplicate or unresolved references.

---

## 3. MTD Validation

Verify the database records for Master Teaching Documents (MTDs) to confirm structural rules.

* [ ] **1 Chapter = 1 MTD**: Execute SQL to verify that each chapter in the course has exactly one corresponding row in the `master_teaching_documents` table.
* [ ] **MTD Status**: Ensure all newly created MTDs have the status set to `"active"` or `"draft"` depending on the release plan.
* [ ] **Chapter Mappings**: Confirm that every KO and Website Material in the database is correctly linked to its respective chapter's `mtdId`.
* [ ] **Markdown Content**: Confirm that the source Markdown for each chapter has been stored without truncation.

---

## 4. Material Validation

Verify the compilation and status of reading materials inside the `website_materials` table.

* [ ] **AST Compilation**: Check that `structuredContent.compilerResult.ast` exists and is populated in the database.
* [ ] **Publish Status**: Verify that the `status` column for each material is set to `"published"` so it is visible to students.
* [ ] **Renderer Compatibility**: View the material in the admin panel AST inspector to verify it renders without crashing.
* [ ] **Formula Blocks**: Ensure LaTeX equations are rendered in block style (`$$ ... $$`) rather than inline where formatting is disrupted.
* [ ] **Term Indexing**: Verify that the `termIndex` JSON array is populated with detected glossary terms and positions.

---

## 5. KO Validation

Validate the ingestion status of individual Knowledge Objects.

* [ ] **KO Counts**: Confirm that the total KOs in the database matches the source count in the bundle.
* [ ] **Chapter Mappings**: Check that KOs are mapped to the correct `chapterId` and the correct MTD.
* [ ] **Concept Mappings**: Ensure that every KO references a valid `conceptId` from the concepts table.
* [ ] **Type Coverage**: Verify that at least one `concept_overview` exists for each concept to anchor the topic.

---

## 6. Flashcard Validation

Validate the flashcard active-recall data.

* [ ] **Flashcard Counts**: Match the database flashcard count against the bundle source count.
* [ ] **Flashcard Set Mappings**: Confirm that flashcards are grouped under the correct sets, which in turn map to the correct chapters.
* [ ] **KO References**: Verify that each flashcard has its `koId` correctly resolved and populated in the database.

---

## 7. Assessment Validation

Validate UTS/UAS or quiz multiple-choice question structures.

* [ ] **Assessment Source Counts**: Verify that exam papers (UTS, UAS) are successfully inserted.
* [ ] **Assessment Object Counts**: Confirm the number of questions loaded.
* [ ] **Chapter Mappings**: Verify that `assessmentSourceChapters` rows are correctly written to link the exam to the chapters.
* [ ] **Explanations Present**: Confirm that `answerMarkdown` (the step-by-step reasoning) is non-empty for all questions.

---

## 8. Concept Graph Validation

Verify the conceptual dependency structure.

* [ ] **Graph Rebuild Success**: Ensure `buildConceptGraph` ran successfully during post-processing.
* [ ] **No Orphan Nodes**: Verify there are no floating concepts with zero links in the graph, unless intentionally declared as introductory.
* [ ] **Relationship Counts**: Confirm that the count of edges in the concept graph database matches the relationship count in the bundle.

---

## 9. Vectorization Validation

Run the vector sync runner ([sync-vectors.ts](../../scripts/sync-vectors.ts)) to sync the course KOs with the vector database.

* [ ] **Vector Queue Populated**: Verify that 20 KOs (or the course total) were enqueued with status `"pending"`.
* [ ] **Vector Queue Completed**: Verify that the sync runner processed the queue and transitioned all entries to `"completed"`.
* [ ] **Namespace Correctness**: Verify the final namespace in the vector store uses the format: `course_${courseId}_learning`.
* [ ] **Embedding Dimensions**: Verify that the uploaded vectors have exactly `1024` dimensions (matching the `zyx-academy` index).

---

## 10. Zyra RAG Validation

Run the retrieval validation script ([validate-retrieval.ts](../../scripts/validate-retrieval.ts)) with `MOCK_GEMINI` disabled to test the actual RAG pipeline.

* [ ] **Definition Query**: Query a core term (e.g. "Apa definisi percepatan?"). Verify `sources.length > 0`.
* [ ] **Formula Query**: Query an equation (e.g. "Bagaimana rumus perpindahan?"). Verify `sources.length > 0`.
* [ ] **Misconception Query**: Query a common error (e.g. "Apakah gaya sentripetal itu gaya fisik?"). Verify `sources.length > 0`.
* [ ] **Sources > 0**: Verify that at least 3 relevant sources are retrieved for each query.
* [ ] **Imported KO Retrieved**: Check that the source IDs in `retrievalMemory` match the imported KO IDs in SQLite.
* [ ] **Namespace Correctness**: Verify the query is made to the exact namespace of the course.
* [ ] **Similarity Score Sanity**: Verify that similarity scores for top matches are above the standard activation threshold (`>= 0.5`, typically between `0.65` and `0.85` for high-relevance matches).

---

## 11. Environment Validation

Check the production configuration before deploying the course.

* [ ] **Pinecone Configured**: `PINECONE_API_KEY` and `PINECONE_INDEX_NAME` are set to production credentials.
* [ ] **AI Gateway Configured**: `CF_AI_GATEWAY_URL` is set to proxy requests.
* [ ] **Embedding Model Configured**: The primary embedding model is configured correctly.
* [ ] **MOCK_GEMINI Disabled**: Ensure that `MOCK_GEMINI` is unset or set to `"false"` in the production environment settings.
* [ ] **Production Environment Variables Present**: Double check database URLs, auth secrets, and keys.

---

## 12. Release Gate

To release the course to students in the production environment, all core validations must pass.

### GO Requirements
* **Bundle valid**: JSON schema and references verified.
* **Import valid**: All rows written to SQLite/Turso.
* **Postprocess valid**: Website materials compiled and published, concept graph rebuilt.
* **Vectorization valid**: All KOs successfully embedded and uploaded to Pinecone.
* **Zyra retrieval valid**: The smoke test validates relevant KO retrieval with scores `>= 0.5`.

### NO-GO Triggers (Deployment Blockers)
* Any database transaction rollback or schema mismatch.
* Unresolved `$id` references or broken KO mappings.
* Empty `compilerResult.ast` for published website materials.
* Vector sync queue items stuck in `"failed"` state.
* Zero sources retrieved during Zyra RAG smoke tests.

---

## 13. Incident Playbook

### Import Failures
* **Symptom**: Importer crashes with database constraint errors.
* **Troubleshooting**:
  1. Inspect the JSON file using a JSON validator to ensure it is syntactically valid.
  2. Check for duplicate `$id` values in the course bundle.
  3. Ensure that all referenced concept `$id`s exist in the same chapter.
  4. Run `bun run db:migrate` to ensure the local SQLite schema is fully updated.

### AST Failures
* **Symptom**: Material fails to render or shows unparsed container syntax.
* **Troubleshooting**:
  1. Check for unclosed triple-colon (`:::`) blocks in the markdown.
  2. Check for syntax errors in the JSON attributes (e.g. `:::concept {ref="ko-id"}` using smart quotes instead of standard straight quotes).
  3. Ensure all formula symbols are wrapped correctly in single or double dollar signs.

### Vector Sync Failures
* **Symptom**: The sync runner fails, or embeds fail with rate limit errors.
* **Troubleshooting**:
  1. Verify the AI Gateway URL and access tokens are valid.
  2. Check the Gemini key pool status to see if any keys have been flagged as disabled or rate-limited.
  3. Add a delay between sync batches or run with a smaller `--limit` parameter (e.g., `--limit 10`).

### Retrieval Failures / Missing Sources
* **Symptom**: Zyra queries return zero sources, or `retrievalMemory.sources` is empty.
* **Troubleshooting**:
  1. Verify that `MOCK_GEMINI` is not set to `"true"` in the environment, which overrides the vector search path.
  2. Inspect the Pinecone namespace stats using the diagnostics code to ensure the vector count matches the KO count.
  3. If similarity scores are low (around `0.05`), the vectors stored in Pinecone are likely random/mock vectors. Reset the sync queue status to `"pending"` in the database and re-run `sync-vectors.ts` with `MOCK_GEMINI=false`.
  4. Ensure the KOs in the database are set to `status = 'active'`. Inactive or draft KOs are filtered out during the hydration step.
