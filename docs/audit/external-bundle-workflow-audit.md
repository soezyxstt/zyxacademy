# External Idea and Product Bundle Workflow Audit

Date: 2026-08-13

Scope: completed Idea-centered Plans 001 through 016, with emphasis on the intended workflow in which an external AI agent creates Ideas and products, then an admin uploads, reviews, and publishes them in Zyx.

## Intended workflow

1. The operator uploads a Source Pack in Zyx, selects course and chapters by name, reviews the detected section mapping, selects products, and downloads one Authoring Job Pack.
2. The external agent receives only that Authoring Job Pack, follows its locked scope and included Idea Bundle schemas, produces source-grounded Ideas, and returns a strict ZIP.
3. Zyx validates the Idea Bundle without persistence and opens an editable Idea, evidence, and relation map.
4. An admin edits and confirms the draft. Zyx reconstructs and validates the ZIP, stages it, then supports approval and atomic publication.
5. The admin exports and downloads a fresh Authoring Context Pack containing the published Ideas, sources, requirements, allowed benchmark summaries, and machine-readable bundle contracts.
6. The external Product skill receives the original Authoring Job Pack and the fresh Context Pack, then produces draft Articles, Diktat, questions, solutions, flashcards, and assessment blueprints as a Product Bundle.
7. Zyx validates quality and traceability without persistence, then opens an editable product and dependency workspace. Explicit confirmation stores a draft. The admin can replace or delete that draft, publish it directly, or later withdraw the published bundle.

## Findings and repairs

| Finding | Risk | Repair |
|---|---|---|
| Authoring Context exports were stored in R2 but had no private download path. | The external authoring handoff could not be completed from the website. | Added an authenticated, retention-aware ZIP download and history actions. |
| The context pack described included data but did not carry output schemas. | An external agent had to infer strict bundle shapes from repository code. | Added generated JSON Schemas for both bundle families and a deterministic workflow contract. |
| Bundle creator fields required private Zyx identity IDs. | An external agent either received unnecessary identity data or produced an artifact that failed at publication. | Added `$UPLOADER` and `$APPROVING_REVIEWER` sentinels resolved inside publication transactions. |
| Idea approval was available from a metadata-only list. | Structurally valid but weak or unsupported Ideas could be approved without content review. | Added complete Idea, provenance, excerpt, relation, formula, and AI metadata previews; actions now live in the review surface. |
| Product approval was available after a preview limited to two sections. | Options, solution quality, curation, and later article blocks could be missed. | The review surface now renders every staged section and hosts approval and publication controls. |
| Product lifecycle exposed implementation states such as validation and approval. | Admins had to understand internal workflow mechanics before publishing content. | The public lifecycle is now only `draft -> published -> withdrawn`; review remains internal accountability evidence. |
| One large authoring skill mixed Idea discovery and every product family. | Long contexts increased context mixing and made iteration difficult. | Authoring is split into Source Pack, Idea Bundle, and Product Bundle skills. Idea and Product skills keep a local preference-only learning profile from explicit corrections, with no Revision Pack. |
| Article blocks were accepted without executing the documented strict compiler gate. | A one-block or unsupported article could be published despite the claimed quality contract. | Product validation now runs the deterministic Article compiler and required coverage gate. |
| Question options were untyped and a question did not require a reciprocal solution. | Products could be impossible to grade or incomplete. | Options now use stable IDs, text, and deterministic correctness; every question requires exactly one solution. |
| Correct-answer markers entered question vector and runtime content. | Retrieval could expose answer keys outside the grading boundary. | Runtime hydration and vector payload construction now remove grading fields from options. |
| Diktat Article lineage was optional. | A Diktat could silently diverge from the approved Article representation. | Every Diktat now requires Article ID, version, hash, and a matching dependency. |
| Bundle R2 keys were built with local sanitizers outside `lib/storage/keys.ts`. | Storage conventions could drift and unsafe logic could be duplicated. | Idea, Product, and Authoring Context keys now use centralized builders. |
| Initial ZIP upload immediately created a staged object and inventory before the admin understood its contents. | Nontechnical admins could store weak or incorrect content and had no safe place to revise it. | Upload now starts with a non-persistent analysis. Dedicated Idea and Product workspaces provide in-place editing, evidence and dependency maps, client guidance, locked identity fields, server-side allowlist merging, hash refresh, and full revalidation before staging. |
| External authoring required operators to find and copy course, chapter, snapshot, run, and attribution IDs. | Setup was error-prone and unsuitable for nontechnical admins. | Added a non-persistent Authoring Job builder with course dropdown, chapter checklist, section mapping, product selection, automatic attribution sentinels, and one self-contained ZIP. Context exports now generate snapshot and run IDs on the server. |

## Remaining gates

- Run an authenticated staging round trip for export, private download, external generation, Idea upload, Product upload, review, and atomic publication.
- Perform desktop, dark mode, and 380 px review of the expanded review surfaces.
- Confirm the external agent can generate a conforming high-quality Idea Bundle using only the downloaded Authoring Job Pack, then a Product Bundle using the fresh Context Pack.
- Product Bundle publication creates an approved assessment blueprint, not a live student assessment. Launch timing remains an explicit admin workflow decision.
- Assigned tutor review remains API-capable but the current pages are admin-only. A tutor-facing review page requires a separate product decision.

No physical database migration, remote database, production deployment, Vectorize backfill, or feature rollout was performed by this local repair.
