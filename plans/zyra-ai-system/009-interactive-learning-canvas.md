# Plan 009: Deliver typed interactive learning visuals

> **Executor instructions**: Extend the existing renderer and visual contracts. Do not add a new UI library and do not execute model-generated JavaScript, HTML, SVG markup, or unrestricted Mermaid. All interaction after render must be local and consume zero AI quota.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- lib/tutor/visual-contracts.ts lib/tutor/visual-serializer.ts components/course/markdown-renderer.tsx components/course/math-text.tsx lib/zyra tests docs lib/env.ts`.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plan 007
- **Category**: product, frontend
- **Status**: IN PROGRESS, local contracts and synthetic smoke pass; staging review is pending
- **Planned at**: commit `03b68ba0`, 2026-08-02

## Why this matters

Zyra already renders math, charts, flowcharts, and a formula graph, but model output is parsed from ad hoc Markdown blocks and many visual interactions are disabled. The target Learning Canvas is an application-owned typed protocol with safe formulas, parameter sliders, editable inputs, accessible fallbacks, and no additional provider calls when a learner explores.

## Current state

- `lib/tutor/visual-contracts.ts` validates basic graph, chart, and flowchart intents.
- `lib/tutor/visual-serializer.ts` converts typed specs into special Markdown blocks.
- `components/course/markdown-renderer.tsx:377` defines `InteractiveGraphWidget`.
- `components/course/markdown-renderer.tsx:1094-1097` disables node dragging and panning.
- Existing dependencies include ReactFlow, ELK, Recharts, KaTeX, mathjs, and motion. Reuse them.
- Some existing renderer colors violate the current semantic-token rules. Changed code must use semantic tokens.

## Learning Canvas protocol

Version 1 supports:

- parameterized function and data plots;
- equation derivation with revealable steps;
- tables and linked multiple representations;
- flowchart and concept map;
- physics vector and free-body diagrams;
- chemistry reaction, stoichiometry, and quantity relationship diagrams;
- annotations, checkpoints, presets, reset, and accessible data fallback.

Every spec declares title, learning purpose, variables, units, domain, controls, constraints, canonical claim references, alt text, and fallback table or textual explanation.

## Scope

**In scope**:

- New `lib/zyra/canvas/**` schemas, validators, safe expression AST, capability registry, and serialization.
- Extend existing visual contracts through compatibility adapters.
- Split renderer widgets out of the monolithic Markdown renderer into `components/course/learning-canvas/**`.
- Parameter controls, local editing, reset, preset, keyboard operation, and reduced motion.
- Add `FEATURE_ZYRA_LEARNING_CANVAS_V1`, tests, fixtures, docs, and visual staging smoke.

**Out of scope**:

- Arbitrary code execution, full computer algebra, 3D molecular simulation, new UI libraries, AI image generation, or production.
- Replacing KaTeX or canonical source validation.

## Git workflow

- Branch: `codex/zyra-ai-009-learning-canvas`.
- Commit example: `feat(zyra): add typed interactive learning canvas`.

## Steps

### Step 1: Define versioned specs and capabilities

Create discriminated schemas per visual type. Bound series count, node count, data points, expression length, numeric ranges, slider count, and label length. Require units where quantities have units. Include a capability version in cache identity.

**Verify**: schema tests accept golden specs and reject unknown type, oversized graph, missing units, invalid domain, and unreferenced claim.

### Step 2: Implement safe expression parsing

Parse math expressions into an allowlisted AST. Permit numeric constants, declared variables, arithmetic, and approved functions. Reject assignment, imports, property access, function construction, unbounded recursion, and identifiers not declared by the spec.

**Verify**: safety fixtures have zero accepted forbidden expressions and all approved course formulas evaluate within bounded time.

### Step 3: Build parameterized plot controls

Render editable function text only through the safe parser. Add sliders with min, max, step, units, and presets. Updating a function or parameter recalculates locally, debounced, with no fetch or AI call. Add reset and invalid-expression feedback.

**Verify**: network-spy tests report zero requests during 100 control changes; rendering remains responsive at the declared maximum points.

### Step 4: Build diagram and representation widgets

Use ReactFlow and ELK for concept and process maps, with optional learner panning and node focus where useful. Use application-owned primitives for vectors, free-body diagrams, chemistry relationships, and derivation steps. The model supplies data, not markup.

**Verify**: each widget has a deterministic snapshot contract, keyboard focus order, and a textual or tabular fallback.

### Step 5: Integrate typed model output

Plan 007 may request a canvas capability. The model returns a structured spec through the response schema. Validate canonical claim references and safety before rendering. Invalid visuals are omitted while the textual explanation remains usable.

Use 3.6 Flash for complex visual specification only when Plan 005 grants premium capacity; otherwise use a simpler supported spec or no visual.

**Verify**: malformed visual output never breaks the whole Zyra response and never triggers a second ordinary model call.

### Step 6: Cache immutable specs

Profile-free visual specs may live inside Plan 006 shared scaffolds. Client interaction state remains local or user-scoped and never mutates the shared spec. Large exported snapshots may use staging R2 with versioned keys and ownership checks.

**Verify**: two learners start from identical spec bytes, change controls independently, and do not affect each other.

### Step 7: Meet accessibility and responsive gates

Support 380 px width, dark mode semantic tokens, keyboard controls, visible focus, reduced motion, alt text, screen-reader summaries, and accessible data tables. Follow the no-pill rule.

**Verify**: changed examples have zero serious or critical automated accessibility violations and all controls work without a pointer.

### Step 8: Run subject-specific fixtures

Create at least five fixtures each for mathematics, physics, and chemistry plus Tutorial PKA. Include invalid units, discontinuities, vector sign changes, reaction coefficients, large values, and empty data.

**Verify**: `bun scripts/eval-zyra-canvas.ts` reports 100 percent schema safety and expected visual-type selection for committed fixtures.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/learning-canvas-schema.test.ts tests/contracts/learning-canvas-expression.test.ts tests/contracts/learning-canvas-renderer.test.ts tests/contracts/learning-canvas-accessibility.test.tsx
bun scripts/eval-zyra-canvas.ts
bun run typecheck
bun --env-file=.env.staging scripts/staging/smoke-zyra-canvas.ts --run-id <runId> --course tutorial-pka
git diff --check
```

## Done criteria

- [ ] The model emits typed data, never executable visual code.
- [ ] Parameter and formula changes use zero AI or network calls.
- [ ] Math, physics, chemistry, and Tutorial PKA fixtures pass.
- [ ] Invalid visuals degrade to valid text.
- [ ] Shared specs remain profile-free and immutable.
- [ ] 380 px, dark mode, keyboard, reduced-motion, and accessibility gates pass.
- [ ] Tests, eval, lint, typecheck, staging smoke, and diff check pass.

## STOP conditions

- A requested visual requires executing arbitrary model output.
- A new UI library appears necessary.
- Safe expression tests accept one forbidden construct.
- Canvas state leaks between users or mutates a shared cache entry.
- A visual can expose restricted solution content during an active assessment.
- Renderer work conflicts with an active Overhaul Plan 015 executor.

An image question implemented by Plan 010 may request a Learning Canvas from the same teaching response. The model must convert observations into this existing typed protocol; it may not return executable SVG, HTML, JavaScript, or unrestricted Mermaid extracted from an image.

## Rollback and maintenance

Set `FEATURE_ZYRA_LEARNING_CANVAS_V1=0` and render validated text plus legacy visuals. Preserve cached specs and R2 artifacts. Every new visual type requires a schema, validator, renderer, textual fallback, accessibility fixture, capability version, cache version, and assessment-policy review.
