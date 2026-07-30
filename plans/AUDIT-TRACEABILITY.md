# Audit Finding Traceability

Snapshot: `6098211`

This matrix proves where each selected critique is addressed. A later executor must not close a plan without checking its rows here.

| Finding | Owning plan | Acceptance signal |
|---|---|---|
| Prompts carry truth, pedagogy, style, policy, and formatting at once | 003, 005, 006, 009 | Each stage has one typed responsibility and only required policy fragments. |
| Deterministic rules are delegated to model prose | 002, 003, 005, 011, 014 | Policy, validation, serialization, redaction, and publication gates execute in code. |
| Uncertainty and abstention are missing | 005, 006, 012 | Typed partial, none, conflict, insufficient, needs-review, and abstention states exist. |
| Numeric model confidence is treated as reliable | 005, 011, 015 | Promotion and cache decisions use measured validation states, not self-reported confidence. |
| Voice, language, math, and style rules are duplicated | 003 | Versioned policy fragments are composed by stage. |
| RAG coverage is binary | 005 | Coverage is full, partial, none, conflict, or needs-review per claim. |
| Raw history contaminates evidence and shared cache | 004 | Shared generation is history-free and style follow-ups use typed actions. |
| Retrieved content and history can inject instructions | 005 | Untrusted data boundaries and adversarial tests preserve policy hierarchy. |
| Citation IDs are not faithful to claims | 005 | Claim support is verified and top-result substitution is removed. |
| Socratic safety is triggered by retrieved source type | 002 | Trusted attempt and activity state select help mode deterministically. |
| Tutor emits raw custom visual syntax | 006 | Model emits a semantic visual spec; code serializes or omits it. |
| Query rewrite always retrieves and mixes style into search | 004 | Action router separates content focus from response modifiers. |
| Concept explainer forces analogies and misconceptions | 006 | Optional pedagogy includes evidence and analogy limitations. |
| Mistake analyzer invents misconception or derivation errors | 006 | Observations and hypotheses are distinct; diagnosis fields are nullable. |
| KO extraction truncates long sources | 008 | Deterministic chunking covers the entire canonical source. |
| KO provenance lacks source spans | 007, 008 | Accepted KOs retain versioned source offsets and hashes. |
| KO replacement destabilizes identity | 007 | Upsert/diff retains IDs and failed runs preserve the accepted set. |
| Knowledge kind and teaching role are conflated | 007 | Separate typed fields and compatibility adapter exist. |
| Bloom is attached to isolated KOs | 007, 008 | Bloom belongs to sourced learning objectives. |
| Canonicalization is aggressive and too name-shortening | 008 | Embeddings only propose; ambiguous merges require review. |
| Question answer positions are model-controlled | 010 | Stable option IDs are shuffled and remapped in application code. |
| Question verification reuses the generator | 011 | Independent blind solver and critic are required for publication. |
| Blueprint coverage and distractor provenance are weak | 010 | Code allocates multidimensional slots and persists sourced mapping metadata. |
| Repair regenerates the whole object | 003, 011 | Stable violation codes restrict one repair to allowlisted fields. |
| Material generation combines planning and syntax | 009 | Outline, semantic blocks, validation, and deterministic serializer are separate. |
| Material conflicts and exclusions are implicit | 009 | Typed conflict groups and exclusion reasons are reviewed before generation. |
| Flashcards can test multiple facts | 013 | Every v2 card has one recall target or is split/rejected. |
| Flashcard difficulty is model opinion | 013 | Content complexity and observed learner recall difficulty are separate. |
| Learner diagnosis overclaims from small samples | 012 | Evidence sufficiency gates observed, interpreted, and recommended layers. |
| Missing per-question timing is fabricated from an average | 012 | Question speed is absent unless measured per question. |
| Recommendation IDs are not reliably actionable | 012 | Resource IDs are allowlisted, access-checked, and rendered as actions. |
| Admin insight mixes item and learner causes | 012 | Item evidence and cohort hypotheses are separate. |
| Admin frequency is assigned by Gemini | 012 | Counts, denominators, and thresholds are deterministic. |
| Assessment extraction inserts valid-looking fallback data | 010 | Failure is typed and difficulty scales use one explicit adapter. |
| Assessment help policy is inconsistent across surfaces | 002 | Tutor and feedback share one deterministic policy. |
| Diktat reviewer can become an uncited co-author | 014 | Reviewer emits findings; a separate bounded author applies accepted fixes. |
| Diktat structural audit samples only early content | 014 | Deterministic checks cover the complete artifact. |
| PDF audit checks text instead of rendered layout | 014 | Page rendering plus deterministic and multimodal checks gate publication. |
| PDF audit failures become PASS | 014 | Provider and parser failures become unavailable and block publication. |
| Exam intelligence lacks a sourced formula registry | 014 | Formulas preserve symbols, units, assumptions, procedure, and source spans. |
| Prompt provenance is incomplete | 003 | Versioned trace includes contract, policy, schema, validator, hashes, retries, and route. |
| Cache can survive prompt or evidence changes | 004 | Cache keys include generation contract and evidence versions. |
| Golden evaluation datasets are missing | 001, 015 | Offline fixtures and labeled golden scorers cover every critical invariant. |
| Content truth, pedagogy, style, and format layers are mixed | 003, 005, 006, 009 | Each layer has a separate contract and owner. |
| Source conflict policy is absent | 005, 009, 014 | Conflicts are attributed and resolved only by explicit policy or review. |
| Active attempt GET routes expose server snapshots | 002 | In-progress list and detail JSON recursively omit protected data. |
| Shared tutor cache can contain user history | 004 | Shared cache tests reject any student or session data. |
| Documentation does not match live AI architecture | Every owning plan, 015 | Each plan updates affected docs; Plan 015 performs final cross-repo scan. |

## Deferred audit-adjacent issues

| Finding | Disposition | Reason |
|---|---|---|
| Generation job failure counters | Separate plan | Operational job accounting is outside the selected prompt architecture scope. |
| Content-quality reconciliation state bug | Separate plan | It is an independent maintenance defect. |
| Full ingestion transaction redesign | Separate plan | Plan 007 fixes KO identity and safe persistence only; whole-pipeline atomicity needs separate authorization. |
