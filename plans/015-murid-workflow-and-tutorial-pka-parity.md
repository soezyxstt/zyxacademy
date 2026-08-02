# Plan 015: Murid Workflow and Tutorial PKA Parity

Status: blocked until Plan 014 passes.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- app components lib scripts tests docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/014-admin-and-tutor-operational-workflow.md
- **Category**: migration, correctness
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Switch the murid experience to the Idea-centered read model while keeping every existing Tutorial PKA registration, schedule, material, simulation, attempt, score, report, flashcard review, mastery view, and tutoring history operational.

## Current state to reverify

- Murid pages currently live under the route group `app/(student)` and APIs include `/api/student/**`.
- Tutorial PKA has dedicated registration, schedule, material, report, and staged simulation flows.
- Simulation progress references existing quiz attempts.
- Only Tutorial PKA currently has substantial data, so it is the primary live staging parity corpus, but all other courses must remain queryable.

Anchor excerpts: `lib/pka-config.ts:4` defines `PKA_COURSE_ID = "tutorial-pka"`; `app/(student)/courses/tutorial-pka/layout.tsx:15-17` gates the feature and loads that course; the PKA page and simulation routes query `studentQuizAttempts` directly. These are preservation-critical callers.

Before editing any Next.js page or route, read the relevant installed guide under `node_modules/next/dist/docs/`.

## Git workflow

- Create branch `codex/015-murid-pka-parity` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- rename route-group and internal domain identifiers from student to murid where they represent the access role or learner domain
- keep public URLs compatible through redirects or route adapters
- `app/(student)/**` to target `app/(murid)/**` migration
- `/api/student/**` to target `/api/murid/**` with versioned compatibility adapters
- `components/course/**` learner surfaces
- Tutorial PKA pages, actions, and components under the learner route group
- murid dashboards, materials, articles, diktat, quizzes, tryouts, flashcards, mastery, recommendations, Zyra, and reports
- `lib/pka-config.ts` and related PKA domain code only where naming or new repositories require it
- `lib/env.ts`
- E2E, accessibility, responsive, and parity tests
- new `scripts/staging/pka-manifest.ts`
- new `scripts/staging/e2e-murid.ts`
- new `scripts/staging/reconcile-pka.ts`
- `package.json`
- `docs/features.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`

Out of scope: changing Tutorial PKA academic rules, recalculating old grades, production deployment, dropping old routes.

## Murid journey contract

1. A murid signs in, sees enrolled courses, enters Tutorial PKA, reads published article and diktat content, reviews Idea-linked flashcards, starts an eligible quiz or simulation, submits answers, receives allowed feedback, views per-Idea mastery and confidence, receives deterministic recommendations, and asks Zyra for permitted help.
2. Old deep links and bookmarks continue to resolve during compatibility.
3. Submitted attempts always render their immutable snapshots even if current questions or Ideas have newer versions.
4. Existing PKA stage unlocks and progress remain based on preserved historical attempts and current rules. No backfill may unlock or lock a stage differently without an explicit rule change, which is outside scope.
5. Legacy concept mastery is labeled as a baseline when no attributable Idea evidence exists.
6. All visible role language uses `murid`; avoid changing normal Indonesian nouns such as `siswa` unless the product vocabulary requires consistency on that surface.
7. New behavior is controlled by `FEATURE_MURID_IDEA_WORKFLOW_V1`.

## Tutorial PKA parity manifest

Create a machine-generated before and after manifest with row counts, primary-key hashes, semantic hashes, and selected aggregates for:

- course and subject configuration;
- users, role memberships, registrations, enrollments;
- announcements and schedules;
- source, chapter, Idea, article, diktat, question, solution, flashcard, and assessment mappings;
- PKA stage progress and attempt references;
- quiz attempts, snapshots, scores, analytics, leaderboards, and reports;
- mastery, flashcard progress and reviews, chats and source citations.

Every old ID must resolve through a compatibility endpoint or mapping record.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Freeze the Tutorial PKA before manifest and a set of real staging read-only journey fixtures.
2. Add new murid route group and API names without removing old paths. Old paths delegate or redirect while preserving method and response semantics.
3. Switch reads by bounded feature area: course shell, materials, flashcards, assessments, results, mastery, recommendations, Zyra, then reports.
4. For each feature area, run old-versus-new response normalization against the same identity and record intentional differences.
5. Switch writes through the dual-write repository and confirm transaction parity.
6. Run complete PKA simulations for a dedicated test murid. Do not modify historical accounts for tests.
7. Test 380 px viewport, keyboard navigation, loading, empty, error, and dark mode on changed pages.
8. Enable the flag for the dedicated account cohort, then all staging murid accounts only after parity passes.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/murid-read-model.test.ts tests/contracts/assessment-redaction.test.ts tests/migration/tutorial-pka-parity.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:pka-manifest -- --run-id <runId> --phase before
bun --env-file=.env.staging run staging:e2e-murid -- --run-id <runId> --course tutorial-pka --account dedicated
bun --env-file=.env.staging run staging:pka-manifest -- --run-id <runId> --phase after
bun --env-file=.env.staging run staging:reconcile-pka -- --run-id <runId> --strict
git diff --check
```

Pass only when preserved-table counts and hashes are identical, every historical ID resolves, existing grades and stage states match exactly, active-attempt leaks equal zero, old deep-link success is 100 percent for the committed route fixture, all required journeys pass, no historical account was mutated by tests, and changed screens pass automated accessibility checks with zero serious or critical violations.

## Test plan

- Cover old and new routes, unauthenticated and wrong-role denial, article and diktat reads, flashcard review, quiz and simulation start and submit, immutable result snapshots, mastery baseline labels, recommendations, Zyra policy, PKA stage gates, 380 px layout, keyboard flow, dark mode, and serious accessibility violations.
- Use only dedicated staging test identities for mutations. Historical identities are read-only parity inputs.

## STOP conditions

- One historical attempt renders current content instead of its snapshot.
- One PKA stage, score, leaderboard row, registration, or report changes unexpectedly.
- An old route returns an unexplained 404 or changes write semantics.
- A test uses a historical murid account for mutation.
- A new Idea read hides legacy data that lacks exact attribution.

## Maintenance notes

Keep compatibility routes until production telemetry proves old links are unused. Any Tutorial PKA rule change must be separated from this migration so parity remains measurable.

## Rollback

Set `FEATURE_MURID_IDEA_WORKFLOW_V1=0`. Route adapters return to legacy reads while retaining all new rows and mappings. Preserve attempts created during the staging test; label them by dedicated test account and do not delete them unless the exact test IDs are approved for cleanup.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-015-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- The complete murid learning loop uses the new domain when enabled.
- Tutorial PKA remains fully operational with exact historical parity.
- Old routes and unattributed legacy history remain accessible.
