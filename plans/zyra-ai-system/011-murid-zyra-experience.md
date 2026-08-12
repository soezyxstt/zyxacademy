# Plan 011: Integrate the complete murid Zyra experience

> **Executor instructions**: Integrate accepted backend contracts into the final murid routes after Overhaul Plan 015 and AI Plan 010. Do not redesign canonical lesson navigation or rebuild the drawer. Read the installed Next.js 16 guide before changing routes, caching, or client boundaries.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- app components/course components/student lib/zyra lib/env.ts docs tests`. A concurrent editor in `components/course/**` is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 004, 007, 008, 009, 010 and Idea-centered Overhaul Plan 015
- **Category**: product, frontend, accessibility
- **Status**: IN PROGRESS, local journeys and zero-provider smoke pass; staging tester review remains pending
- **Planned at**: commit `03b68ba0`, 2026-08-02

Local evidence: `artifacts/staging-overhaul/20260812-plan011-audit/plan-011-murid.json`. The feature flags remain off. The allowance summary, bounded selection-to-ask, attachment path, Canvas local interaction, and pet states are wired to real application state in the local implementation.

## Why this matters

The backend overhaul is not useful if Zyra remains a generic sparkle icon in a detached drawer. Murid need one coherent tutoring experience while reading, selecting text, attaching images, exploring visuals, and monitoring their allowance. The interface must communicate Zyra's teaching state without pretending that provider quota or model health is unlimited.

## Target journeys

1. Open Zyra from a lesson and ask a text question with exact lesson context.
2. Highlight a passage and choose `Tanya Zyra`; a popover previews the bounded selection before opening a contextual turn.
3. Paste or attach up to four images through Plan 010 and keep the typed question on failure.
4. Explore a Learning Canvas locally with no additional quota use.
5. See remaining provider-backed turns, total-interaction guard, reset time, and whether a response was served without provider spend.
6. Continue the same authorized conversation on mobile without losing context or exposing another course.

## Zyra pet state contract

Implement Zyra as an application-owned SVG or existing asset composition with these states: `idle`, `listening`, `uploading`, `thinking`, `explaining`, `checking`, `success`, `confused`, `quota_resting`, and `error`. The pet conveys state through restrained movement, expression, and accessible text. It is not a button shape, does not use a gradient, and respects reduced motion. Animation state comes from real application events, never a fake timer that masks latency.

Do not install an avatar or animation library. Reuse existing motion support, semantic tokens, and current UI primitives. The pet must not resemble Gemini branding.

## Scope

**In scope**:

- Final drawer composition, launcher, contextual selection popover, usage display, image controls from Plan 010, Canvas placement, pet states, mobile layout, and accessibility.
- Authenticated usage summary endpoint backed by Plan 004.
- Feature flags `FEATURE_ZYRA_MURID_V3`, `FEATURE_ZYRA_SELECTION_ASK_V1`, and `FEATURE_ZYRA_PET_V1`.
- Tutorial PKA and representative math, physics, and chemistry staging journeys.

**Out of scope**:

- New quota policy, model routing, canonical retrieval, grading, admin copilot, new animation libraries, or production deploy.

## Git workflow

- Branch: `codex/zyra-ai-011-murid-experience`.
- Commit example: `feat(zyra): integrate murid tutoring experience`.

## Steps

### Step 1: Bind UI to versioned backend contracts

Create one typed client boundary for conversation messages, teaching blocks, attachments, Canvas specs, usage summary, and stable errors. Do not let components parse provider-specific fields. Text-only historical messages remain renderable.

**Verify**: contract fixtures cover current, old text-only, quota exhausted, cached, image, Canvas, assessment-limited, and malformed responses.

### Step 2: Build accurate allowance feedback

Display `provider-backed tersisa`, total interactions used versus limit, premium turns remaining when relevant, and Jakarta reset time. Murid and tutor see only their own allowance. A cache hit or deterministic action labels that no provider allowance was spent. Never infer provider capacity from a local counter; unavailable global capacity is a separate status.

**Verify**: UI snapshots match Plan 004 reserve, commit, refund, cache-hit, timeout, and midnight-reset cases exactly.

### Step 3: Add selection-to-ask

Capture only an explicit selection inside the authorized lesson reader. Normalize whitespace and limit length without losing the selected quote. The popover offers short actions such as explain, give an analogy, connect to prior concept, or ask a custom question. Send canonical lesson and source identifiers, not arbitrary surrounding DOM or hidden content.

On mobile, provide an accessible action after selection when browser APIs permit it; otherwise preserve copy and drawer workflows. Clear stale selection when route, lesson revision, or authorization changes.

**Verify**: selection tests prevent cross-lesson context, hidden answer capture, oversized selection, stale source use, and HTML injection.

### Step 4: Integrate the Zyra pet

Create an accessible pet component whose state is derived from upload, request, stream, validation, response, check, quota, and error events. Provide a static reduced-motion rendering and a text status announced through a polite live region. Do not animate continuously when idle for long periods.

**Verify**: state transition tests have no impossible state, stuck animation, or status mismatch. Reduced-motion mode has no nonessential movement.

### Step 5: Compose teaching blocks and Canvas

Render explanation blocks in pedagogical order, canonical citations, one check-for-understanding, and an optional Canvas. Keep the learner's current reading position stable when the drawer opens. Local Canvas edits never submit until the learner explicitly sends an answer or question.

**Verify**: keyboard focus, scroll containment, citation access, Canvas fallback, and no-network local interaction tests pass.

### Step 6: Make failures recoverable

Preserve the draft, selection context, and ready attachments after network, provider, or validation failure. Use stable recovery actions for retry, use text only, remove one attachment, or wait for reset. Never silently double-send after a timeout.

**Verify**: injected offline, 429, 5xx, timeout, expired attachment, cache failure, and malformed response cases produce one clear recovery path and correct quota state.

### Step 7: Validate responsive and accessible behavior

Test 380 px, tablet, and desktop; light and dark modes; keyboard-only; screen reader landmarks; zoom to 200 percent; reduced motion; paste; drag and drop; touch selection; and long math. Use semantic tokens and no pill-shaped controls.

**Verify**: serious or critical automated accessibility violations are zero and all primary journeys complete without a pointer.

### Step 8: Prove Tutorial PKA journeys

Run at least: explain selected paragraph, misconception diagnosis, active-simulation hint, image of handwritten working, image of a graph, interactive parameter edit, quota exhausted, cached explanation, and resumed conversation. Preserve all existing Tutorial PKA data.

**Verify**: each scripted journey writes privacy-safe pass or fail evidence with screenshot references that contain only synthetic staging data.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/zyra-murid-client.test.ts tests/contracts/zyra-selection-ask.test.tsx tests/contracts/zyra-pet.test.tsx tests/contracts/zyra-usage-ui.test.tsx tests/contracts/zyra-drawer-journeys.test.tsx
bun run typecheck
bun --env-file=.env.staging scripts/staging/smoke-zyra-murid.ts --run-id <runId> --course tutorial-pka --synthetic-user
git diff --check
```

## Done criteria

- [ ] Text, selection, pasted image, attached image, and Canvas journeys work in one drawer.
- [ ] Allowance display is exact for all lease outcomes and Jakarta reset.
- [ ] Zyra pet state matches real application state and reduced motion.
- [ ] Drafts and attachments survive recoverable failures.
- [ ] Active assessment restrictions remain visible and enforced.
- [ ] Tutorial PKA data and existing text chat remain readable.
- [ ] 380 px, keyboard, dark mode, and accessibility gates pass.
- [ ] Tests, lint, typecheck, staging journeys, and diff check pass.

## STOP conditions

- Overhaul Plan 015 routes or drawer are unfinished or being edited concurrently.
- UI requires provider-specific response parsing or duplicates allowance math.
- Selection capture includes hidden or unauthorized content.
- Pet animation requires a new dependency.
- One recovery flow can double-send or double-charge a turn.
- A changed surface violates the repository design system.

## Rollback and maintenance

Disable the three feature flags independently. The accepted text-only drawer remains the fallback. Do not delete conversations, attachments, usage events, or local Canvas state during rollback. Any new pet state must map to a real application event, accessible label, reduced-motion rendering, and transition test.
