# Plan 014: Code-split the heavy renderers off the student course bundle

> **Executor instructions**: Follow step by step. Run every verification command. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- components/course/markdown-renderer.tsx components/course/material-viewer.tsx`
> If either changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

`components/course/markdown-renderer.tsx` is a 1657-line `"use client"` component that statically imports `katex`, `mathjs` (`* as math`), `ReactFlow` + `reactflow/dist/style.css`, and `recharts`. It renders on the hottest student route (course material). These libraries (reactflow ~400KB, recharts ~400KB, mathjs ~150KB, katex ~280KB CSS+fonts) ship in the initial JS for every student opening any material, even plain-text material with no chart, diagram, or formula. There is zero code-splitting in the repo today (`next/dynamic` appears nowhere). This establishes the pattern and removes the largest deps from first paint.

## Current state

`components/course/markdown-renderer.tsx:1-40` (static heavy imports, condensed — katex at `:4`, mathjs `:20`, ReactFlow + css `:21-22`, recharts `:23-40`):
```tsx
"use client";
import katex from "katex";
import * as math from "mathjs";
import ReactFlow, { ... } from "reactflow";
import "reactflow/dist/style.css";
import { LineChart, BarChart, ScatterChart, ... } from "recharts";
```
The renderer branches by AST/block type (it already decides per block whether to render a chart, a diagram, a formula, or text). `components/course/material-viewer.tsx` (2108 lines) imports `MarkdownRenderer` at `:52` and renders it on the student course path at `:1276` and `:1281`.

Confirmed: `grep -rEl "next/dynamic" app components` → 0 matches (no code-splitting anywhere).

Next.js version: 16.2.9 (App Router). `next/dynamic` with `{ ssr: false }` is the mechanism; heavy sub-renderers become separate chunks loaded only when a block of that type is present.

## Commands you will need

| Purpose   | Command             | Expected  |
|-----------|---------------------|-----------|
| Typecheck | `bun run typecheck` | exit 0    |
| Lint      | `bun run lint`      | exit 0    |
| Dev serve | `bun run dev`       | boots; material page renders |
| Build     | `bun run build`     | exit 0 (run ONCE at the end to confirm chunks split; this is a breaking-change-scope check, allowed here) |

Note: AGENTS.md says do not run `bun run build` unless breaking changes or explicitly requested; a bundle-splitting change is exactly the "explicitly relevant" case — run it once at the end to confirm.

## Scope

**In scope**:
- `components/course/markdown-renderer.tsx`
- New child components extracted for the heavy renderers, e.g.:
  - `components/course/renderers/flow-diagram.tsx` (ReactFlow)
  - `components/course/renderers/chart-block.tsx` (recharts)
  - `components/course/renderers/math-eval.tsx` (mathjs) — only if mathjs is used at render time, not build time

**Out of scope**:
- Changing what the renderer outputs (visual parity required — same DOM/props).
- `material-viewer.tsx` beyond importing the (unchanged-API) renderer.
- katex: keep it, but see Step 3 — do not attempt to remove katex behavior, only consider deferring its load if trivially safe. If risky, leave katex static and note it.

## Git workflow

- Branch: `advisor/014-course-renderer-code-splitting`
- Commit: `perf(course): dynamic-import reactflow, recharts, and mathjs in the markdown renderer`
- No push/PR unless instructed.

## Steps

### Step 1: Extract the ReactFlow diagram into its own component

Move all ReactFlow JSX + the `reactflow/dist/style.css` import into `components/course/renderers/flow-diagram.tsx` (a `"use client"` component). Keep the exact props/output. In `markdown-renderer.tsx`, import it lazily:
```tsx
import dynamic from "next/dynamic";
const FlowDiagram = dynamic(() => import("./renderers/flow-diagram"), { ssr: false, loading: () => <div className="bg-muted rounded-md animate-pulse h-64" /> });
```
Use the loading skeleton style from AGENTS.md (`bg-muted rounded-md animate-pulse`, no spinners). Render `<FlowDiagram .../>` only in the branch that currently renders a diagram.

**Verify**: `bun run typecheck` → exit 0; `bun run dev` → a material with a diagram still renders it.

### Step 2: Extract recharts charts the same way

Move the recharts chart JSX into `components/course/renderers/chart-block.tsx`; dynamic-import it with `{ ssr: false }`. Render only in the chart branch.

**Verify**: `bun run typecheck` → exit 0; a material with a chart still renders.

### Step 3: Defer mathjs if it is used at render time

Determine how `mathjs` is used: if only for evaluating expressions at render (e.g. computing a value for a chart/graph), move that logic behind a dynamic `import("mathjs")` inside the handler that needs it (async), or into the chart/diagram child so it is not in the top-level bundle. If mathjs is used synchronously in the hot render path in a way that cannot be deferred without behavior change, leave it and note it in the PR. Do the same judgment for `katex` — prefer leaving katex static if deferring risks flashes of unstyled math; note the decision.

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Confirm the split actually happened

Run `bun run build` once. Confirm the build succeeds and that reactflow/recharts are no longer in the main shared chunk (they should appear as separate lazy chunks). If the build output does not clearly show this, note what you observed.

**Verify**: `bun run build` → exit 0.

## Test plan

- No unit tests (rendering). Verification is visual parity in `bun run dev`: a material with a diagram, one with a chart, one with a formula, and a plain-text material all render identically to before.
- Record in the PR: initial JS for a plain-text material page before vs after (from build output or devtools network), to confirm the heavy libs are no longer loaded eagerly.

## Done criteria

ALL must hold:
- [ ] ReactFlow and recharts are loaded via `next/dynamic`, not static top-level imports, in `markdown-renderer.tsx`
- [ ] `grep -n "from \"reactflow\"" components/course/markdown-renderer.tsx` → no static import (moved to child)
- [ ] Visual parity confirmed for diagram/chart/formula/plain-text materials (recorded in PR)
- [ ] `bun run typecheck` / `bun run lint` exit 0; `bun run build` exits 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- The heavy renderers share deep state with the parent that cannot be passed via props cleanly — STOP and report; a larger refactor is needed and this plan's low-risk premise is void.
- Dynamic import with `{ ssr: false }` breaks SSR/hydration for materials that must render server-side — report; some content may require server rendering.
- `bun run build` fails for an unrelated reason — report the error; do not chase out-of-scope fixes.

## Maintenance notes

- Reviewer: verify visual parity screenshots and that no diagram/chart regressed.
- This establishes the `next/dynamic` pattern — future heavy client components (three.js if ever re-added, etc.) should follow it.
- The god-file size of `markdown-renderer.tsx` (1657 lines) is separately noted in the audit; this extraction is a first cut at reducing it.
