# Plan 014: Admin and Tutor Operational Workflow

Status: blocked until Plan 013 passes.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- app components lib scripts tests docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/013-zyra-canonical-runtime.md
- **Category**: direction, security
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Provide one clear operational path from source intake to reviewed, published learning products and assessments, with explicit responsibility boundaries for admin and tutor.

## Current state to reverify

- Admin AI pages are split across extraction, materials, quizzes, insights, and bundle tabs.
- Tutor routes already exist under `/tutor`, but access checks still use the legacy `teacher` role.
- Bundle progress is partly simulated in the client.
- Several admin and tutor mutations are distributed across server actions and API routes, so authorization and audit coverage must be inventoried by exact mutation.

Anchor excerpt from `app/(tutor)/layout.tsx:15-16`:

```ts
const role = (session.user as { role?: string | null }).role;
if (role !== "teacher" && role !== "admin") redirect("/");
```

This access gate is a concrete caller that must move to membership-based authorization.

Before editing any Next.js page, read the relevant guide under `node_modules/next/dist/docs/` for the installed Next.js version.

## Git workflow

- Create branch `codex/014-admin-tutor-workflow` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- `app/(admin)/admin/**` learning-content and role-management surfaces
- `app/(tutor)/**`
- admin and tutor API routes and server actions for the target workflow
- `components/admin/**` bundle and review components
- `components/tutor/**`
- new `lib/workflow/content-workflow.ts`
- new `lib/audit/mutasi.ts`
- authorization callers using legacy access-role values
- rename domain field `teacherNotes` to target `catatanTutor` through the compatibility repository
- `lib/env.ts`
- E2E and contract tests
- new `scripts/staging/e2e-admin-tutor.ts`
- new `scripts/staging/reconcile-audit.ts`
- `package.json`
- `docs/features.md`, `docs/ARCHITECTURE.md`, `docs/DB_SCHEMA.md`, `AGENTS.md`

Out of scope: murid UI, production, deletion of legacy API routes.

## Responsibility contract

Admin can manage courses, chapters, sources, role memberships, assignments, policy, bundle validation, final approval, publication, withdrawal, and audit review.

Tutor can access only assigned courses; review Idea correctness and provenance; review articles, diktat, questions, solutions, flashcards, and blueprints; add `catatanTutor`; grade permitted free responses; and request changes. Tutor cannot grant roles, bypass holdout policy, mutate another course, or publish canonical content.

One multi-role person can switch surfaces without overwriting memberships.

## Workflow states

Use one server-owned transition graph:

`uploaded -> validated -> staged -> tutor_review -> changes_requested | admin_review -> approved -> published -> superseded | withdrawn`

Invalid transitions return stable reason codes. UI buttons derive from server-provided allowed actions, not duplicated client logic. Every mutation records actor, roles, course, entity and version, before and after hashes, request ID, reason, and timestamp.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Enumerate all admin and tutor mutation endpoints into a checked-in test manifest. Classify authorization, audit, idempotency, and target repository for each. This is scoped workflow inventory, not a broad product audit.
2. Implement the transition service and mutation audit boundary.
3. Replace access-role checks with `hasPeran` or `hasAnyPeran`. Do not alter chat speaker roles.
4. Route new workflows through Indonesian domain repositories. Keep legacy endpoints as adapters behind flags.
5. Build a single course workspace that shows sources, Ideas, products, assessments, bundle state, dependency freshness, review blockers, and next allowed action.
6. Replace simulated client progress with durable import and publication phases.
7. Apply the Zyx design system, no pills, no nested cards, semantic colors, dark mode, and 380 px mobile behavior.
8. Run E2E journeys for admin, assigned tutor, unassigned tutor, murid, and multi-role accounts against staging.
9. Run audit reconciliation: mutation count equals audit event count for every successful state change; rejected changes have denial evidence but no domain mutation.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/content-workflow.test.ts tests/contracts/authorization-matrix.test.ts tests/contracts/mutation-audit.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:e2e-admin-tutor -- --run-id <runId> --course tutorial-pka
bun --env-file=.env.staging run staging:reconcile-audit -- --run-id <runId>
git diff --check
```

Pass only when all valid state transitions succeed, all invalid transitions fail with expected codes, unassigned tutor mutations equal zero, unauthorized data reads equal zero, successful mutation to audit ratio is exactly 1 to 1 or the documented transaction-event cardinality, multi-role access works, and no visible access role uses `teacher` or `student`.

## Test plan

- Cover each workflow transition, changes requested, publish denial, course assignment boundary, multi-role navigation, retry idempotency, durable progress, audit cardinality, and role-copy checks.
- Add E2E tests for admin, assigned tutor, unassigned tutor, murid, and multi-role accounts using dedicated staging fixtures.

## STOP conditions

- UI permits a transition the server rejects or hides a server-required blocker.
- Any mutation bypasses centralized authorization or audit.
- Tutor can publish or access unassigned courses.
- Role conversion overwrites another membership.
- Simulated progress remains on a durable workflow.

## Maintenance notes

Every future admin or tutor mutation must enter the mutation manifest and centralized audit boundary. Review server authorization independently of button visibility.

## Rollback

Disable the new workflow flags and `FEATURE_PERAN_V2`, then use legacy surfaces. Keep audit and staged rows. Do not reverse successful canonical publications by deleting rows; create a withdrawal or superseding event.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-014-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- Admin and tutor responsibilities are explicit and enforceable.
- The entire source-to-publication workflow is usable from one coherent course workspace.
- Every mutation is authorized, idempotent where required, and audited.
- Access-role language is `admin`, `tutor`, and `murid` in the active workflow.
