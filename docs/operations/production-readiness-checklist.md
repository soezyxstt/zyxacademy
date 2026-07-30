# Production Readiness Checklist

This document tracks system validation gates and pre-deployment readiness checks for the Zyx platform.

## Pre-Deployment Validation Gates

- [ ] **Linting**: `bun run lint` passes with 0 errors and 0 new warnings.
- [ ] **Type Checking**: `bun run typecheck` (`tsc --noEmit`) passes with 0 errors.
- [ ] **AI Contract Suite**: `bun run test:ai-contracts` passes deterministically with 0 network calls.
- [ ] **Targeted Contract Check**: `bun test tests/contracts/prompt-executor.test.ts` executes and passes.

## Architectural Guidelines & Boundaries

- All AI contract tests must execute under zero-network conditions using `fakeAi` and `fakeCache`.
- No raw student data or user identifiers permitted in shared cache entries (`shared:` or `tutor:` keys).
- Every AI test fixture must maintain schema version `1.0` and reference a valid `requirementId`.
- No pill-shaped UI elements (`rounded-full` prohibited except on 1:1 circular elements).
- No em dashes or en dashes in any codebase file.
