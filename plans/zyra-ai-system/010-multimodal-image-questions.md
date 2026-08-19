# Plan 010: Add private image questions to Zyra

> **Executor instructions**: Implement this as an authenticated multimodal tutoring path, not a generic public upload endpoint. Read the installed Next.js 16 route-handler and request-body documentation before editing. Run every privacy, quota, and assessment gate. Stop if the final Overhaul chat schema is not yet stable.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- db/schema.ts lib/env.ts lib/tutor-rag.ts lib/zyra lib/ai components/course app/api workers/zyra-control-plane tests docs package.json`. Rebase onto completed Overhaul Plans 013 and 015 plus AI Plans 001 through 009. A concurrent edit to the drawer, chat schema, provider adapter, or assessment policy is a STOP condition.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 001, 002, 004, 005, 007, 009; Idea-centered Overhaul Plans 013 and 015
- **Category**: product, security, privacy, frontend
- **Status**: IN PROGRESS, local implementation, focused tests, evaluation, and zero-provider smoke pass; live staging image matrix and human review remain pending
- **Planned at**: commit `03b68ba0`, 2026-08-02

Local evidence: `artifacts/staging-overhaul/20260812-plan010-audit/plan-010-images.json`. The optional image capability remains off. The private attachment path now has bounded sanitization, owner and course scope checks, shared-cache bypass, application-level expiry, and an idempotent expiry sweeper. This is not a live provider or production approval.

## Why this matters

Murid must be able to paste a screenshot, attach a diagram, photograph handwritten work, or capture a problem from a phone and ask Zyra inside the drawer. This creates a higher-risk data path than text. Files can contain identity data, malicious payloads, location metadata, protected assessment answers, or very large decompressed images. The implementation must make multimodal tutoring feel native while keeping authorization, quota, assessment safety, and storage lifecycle application-owned.

## Current state to reverify

- The existing tutor drawer accepts text only and does not declare an attachment contract.
- The Gemini adapter is text-oriented until Plan 002 adds ordered multimodal parts.
- Existing `zyx-staging` R2 must not be assumed private. Plan 001 provisions `zyx-zyra-private-staging` with no public domain and a 7-day lifecycle under `zyx-attachments/`.
- Existing teaching and visual contracts can carry a safe explanation and optional Learning Canvas, but not attachment provenance.
- Official Gemini guidance supports inline image parts when the total request is at most 20 MB. This plan targets at most 16 MB after sanitization to leave room for text and serialization overhead.

## Product contract

Each Zyra turn accepts zero to four images through:

1. clipboard paste while the composer is focused;
2. an attachment button and native file picker;
3. drag and drop on desktop;
4. camera or photo-library capture through the mobile file picker.

V1 accepts JPEG, PNG, and WebP. GIF, SVG, PDF, HEIC, TIFF, and unknown formats are rejected with a short Indonesian error. Each source file may be at most 8 MB. The server sanitizes and resizes accepted files so all image parts plus prompt bytes remain at most 16 MB. Longest edge is at most 4096 pixels, total decoded pixels are bounded, animation is discarded, and all EXIF, GPS, ICC payloads not required for display, comments, and original filenames are removed.

The drawer shows thumbnails, upload state, remove controls, accessible file names, and retry before sending. A failed upload consumes no provider allowance. A sent multimodal turn consumes exactly one provider-backed allowance even when it contains four images. Cache hits are not offered for learner-uploaded images.

## Data and authorization contract

After the final chat schema is stable, add an additive `zyra_message_attachments` table or the closest compatible name with:

- stable attachment ID and owning message ID;
- owner user ID, course ID, and authorized conversation ID;
- private R2 object key, never a public URL;
- sanitized SHA-256, MIME type, byte size, width, height, and status;
- created, expires, deleted, and provider-dispatch timestamps;
- sanitizer version and privacy-safe failure code.

Do not store the raw source file. Write only the sanitized output to R2. Object keys use random opaque IDs under `zyx-attachments/<yyyy-mm-dd>/`; never user email, raw user ID, filename, course title, or prompt text. The authenticated attachment route authorizes the owner or a role explicitly allowed to inspect that conversation. A guessed object key, attachment ID, or message ID must not cross the authorization boundary.

Database migration follows expand, migrate, verify, switch. Old text-only messages remain readable and need no backfill.

## Scope

**In scope**:

- Attachment schemas, validation, sanitization, private R2 storage adapter, ownership checks, and cleanup metadata.
- Authenticated upload, delete-before-send, and private read routes integrated with the final drawer.
- Paste, attach, drag and drop, mobile capture, previews, remove, retry, and send-state UI.
- Multimodal provider request assembly, health-aware model routing, one-call teaching response, optional Learning Canvas, usage accounting, privacy-safe telemetry, and feature flag `FEATURE_ZYRA_IMAGE_INPUT_V1`.
- Tests, fixtures, staging smoke, privacy evidence, documentation, and the final schema and env updates required by this feature.

**Out of scope**:

- Public image hosting, image generation, video, audio, PDF upload, persistent personal galleries, arbitrary OCR services, biometric recognition, face identification, or production deployment.
- Replacing canonical content image ingestion owned by the Idea-centered overhaul.
- Shared cache entries derived from learner uploads.

## Git workflow

- Branch: `codex/zyra-ai-010-image-questions` from all accepted predecessors.
- Commit example: `feat(zyra): add private multimodal questions`.
- Do not push or deploy production unless instructed.

## Steps

### Step 1: Freeze the threat model and attachment contract

Document trust boundaries for browser source bytes, server-decoded pixels, sanitized bytes, private R2, provider payload, chat metadata, and authorized reads. Define stable error codes for unsupported type, bad magic bytes, file too large, decoded image too large, corrupt image, sanitizer failure, unauthorized, expired, and provider rejection.

**Verify**: a contract test rejects mismatched extension and magic bytes, unknown MIME, SVG disguised as PNG, animated payload, excessive pixel count, and missing ownership context.

### Step 2: Implement bounded server-side sanitization

Inspect whether the already-installed image runtime provides a supported server-side decoder. Prefer the existing `sharp` runtime only if it resolves directly and works in the actual hosting runtime. Decode with hard byte, dimension, frame, pixel, time, and memory limits. Re-encode accepted files to sanitized JPEG, PNG, or WebP with orientation applied and metadata removed. Never trust client-computed dimensions or MIME.

Do not add a dependency silently. If no supported decoder is present or the deployment runtime cannot execute it, STOP and request approval for the smallest direct dependency or a Cloudflare-native processing design.

**Verify**: golden files prove pixel appearance remains legible, EXIF and GPS tags are absent, decompression bombs fail closed, and sanitization completes within the declared resource budget.

### Step 3: Add private storage and ownership records

Upload only sanitized bytes to Plan 001's private R2 binding. Create the attachment record transactionally enough that an orphan sweeper can identify incomplete objects. Do not expose presigned or public URLs to Gemini; fetch authorized bytes server-side and pass them inline. Add deletion for unsent attachments and lifecycle-compatible handling for expired objects.

**Verify**: owner read succeeds; another murid, a tutor from another course, an unauthenticated caller, and a guessed ID all receive the same safe not-found response. Object listing and logs contain no filename or identity data.

### Step 4: Build resilient upload and composer UX

Extend the final drawer composer with a non-pill attachment button, paste listener scoped to the composer, desktop drop target, and mobile `accept="image/jpeg,image/png,image/webp"` file input using camera capture where supported. Show at most four previews with per-item state and remove control. Preserve typed text when upload or send fails. Disable send until all selected files are either ready or removed.

The paste handler must not steal non-image clipboard text. Removing an unsent image schedules private deletion without removing the typed question. Announce upload errors and progress to assistive technology. Test at 380 px, keyboard-only, dark mode, and reduced motion.

**Verify**: component tests cover paste, attachment picker, drag and drop, mobile attributes, duplicate file selection, four-image limit, remove, retry, preserved text, and focus restoration.

### Step 5: Assemble one multimodal provider call

Fetch and reauthorize attachment records immediately before dispatch. Recheck expiry, sanitizer version, byte totals, MIME, course, conversation, and owner. Build ordered text and inline image parts through Plan 002's adapter. Keep the whole serialized request under 16 MB; do not rely on the provider's 20 MB rejection as validation.

Use 3.1 Flash-Lite for ordinary readable diagrams or screenshots when its registry capability and live health allow it. Request 3.6 Flash for complex handwriting, dense charts, physics, chemistry, or image-to-Canvas reasoning only when Plan 005 grants premium capacity. Fall back to a healthy multimodal standard model, then return a typed capacity message. Never drop the image and pretend a text-only model saw it.

One turn reserves one allowance before dispatch and commits it only according to Plan 004 lease rules. Image preprocessing and upload failures happen before reservation. Do not make a separate OCR, classification, captioning, or repair model call.

**Verify**: fake-provider tests assert ordered parts, at most one generation call, exact lease transitions, hard payload bound, premium fallback, and no text-only degradation.

### Step 6: Apply pedagogical and assessment policies to image content

Extend `ZyraTeachingResponse` with bounded `imageObservations`, `uncertainties`, and `unreadableRegions`. Observations describe visible evidence; inferences remain labeled. Zyra may ask for a clearer crop rather than invent unreadable symbols. The teaching state machine remains server-owned.

Run the active-assessment policy before model dispatch and validate the response afterward. A screenshot or photograph of an active quiz question must not bypass hint level, citation, or direct-answer restrictions. The response can identify the governing concept, ask a diagnostic question, show an analogous example, or reveal only the allowed next step. It cannot transcribe a protected answer key or return the final choice.

When useful, the same response may include a Plan 009 Learning Canvas spec derived from visible information. It must use the typed protocol and approved evidence, never image-derived executable markup.

**Verify**: adversarial fixtures include screenshots that contain instructions to ignore policy, visible answer keys, hidden small text, handwritten final answers, diagrams with mislabeled units, and requests for direct quiz answers. Direct-answer leaks are zero.

### Step 7: Exclude learner images from shared caching and logs

Mark all turns with learner attachments `sharedCacheEligible=false` before Plan 006 lookup. Do not embed, semantically index, or exact-cache image bytes, image observations, or final responses in cross-user layers. A user-scoped conversation read may replay the stored message if still authorized, but it is not a provider-response cache hit.

Telemetry records attachment count, sanitized MIME class, bounded size bucket, dimensions bucket, sanitizer version, route class, latency, and stable failure code. Never record raw bytes, full hash, OCR text, prompt text, filename, object key, R2 URL, EXIF, or model-generated image description in Analytics Engine, AI Gateway metadata, logs, or traces.

**Verify**: log and Analytics snapshots contain only allowlisted fields; cache spies observe zero lookup, vector write, or shared KV write for image turns.

### Step 8: Add cleanup, deletion, and incident controls

Add an idempotent sweeper for orphaned uploads and database rows whose R2 object has expired. Respect the 7-day staging lifecycle, but do not rely on exact lifecycle timing for authorization. Expired records become unreadable immediately at application level. Add an admin kill switch that disables new image uploads while preserving text chat and authorized historical metadata.

**Verify**: repeated sweeps are safe; partial DB or R2 failures converge; disabling `FEATURE_ZYRA_IMAGE_INPUT_V1` blocks uploads and multimodal dispatch without deleting data.

### Step 9: Run multimodal evaluation and staging smoke

Commit copyright-safe fixtures for clear and blurry handwriting, equations, graphs, free-body diagrams, chemical structures, tables, screenshots, rotated photos, low contrast, malicious metadata, and active assessments. Use no real student images in fixtures.

Machine gates:

- unauthorized attachment reads: 0;
- accepted attachments with EXIF or GPS metadata: 0;
- accepted unsupported or mismatched formats: 0;
- provider requests above 16 MB: 0;
- provider calls per ordinary image turn: at most 1;
- active-assessment direct-answer leaks: 0;
- shared cache reads or writes for learner image turns: 0;
- correct observation versus inference separation: at least 95 percent on the approved fixture set;
- supported clear-image questions returning a valid teaching response: at least 95 percent;
- serious or critical accessibility violations on changed UI: 0.

Human review scores readability, uncertainty calibration, scaffolding, whether the response uses the image, and whether generated visuals materially help. Reviewers must not use the implementation model as the sole judge.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/zyra-attachment-validation.test.ts tests/contracts/zyra-attachment-auth.test.ts tests/contracts/zyra-multimodal-adapter.test.ts tests/contracts/zyra-image-assessment.test.ts tests/contracts/zyra-image-cache-isolation.test.ts tests/contracts/zyra-image-composer.test.tsx
bun scripts/eval-zyra-images.ts
bun run typecheck
bun --env-file=.env.staging scripts/staging/smoke-zyra-images.ts --run-id <runId> --course tutorial-pka --max-provider-requests 24
git diff --check
```

The staging script uses synthetic fixtures, never local screenshots or production data, and writes `artifacts/zyra-ai/<runId>/plan-010-result.json` with only privacy-safe aggregates.

## Done criteria

- [ ] Paste, attach, drag and drop, and mobile capture work in the drawer.
- [ ] No source image, metadata, filename, public URL, or identity-bearing key is stored.
- [ ] Every private read reauthorizes owner, conversation, course, and role.
- [ ] Every accepted file is sanitized and the total provider request is at most 16 MB.
- [ ] An image turn uses at most one provider call and exactly one allowance lease.
- [ ] Learner image turns never enter shared exact or semantic cache.
- [ ] Assessment screenshots produce zero direct-answer leaks.
- [ ] Optional image-derived visuals use the typed Learning Canvas protocol.
- [ ] Text-only Zyra remains operational when image input is disabled.
- [ ] Targeted tests, eval, lint, typecheck, staging smoke, and diff check pass.

## STOP conditions

- Overhaul Plan 013 assessment policy or Plan 015 drawer contract is missing, failing, or concurrently changing.
- Plan 001 private R2 bucket is public, absent, or lacks the approved lifecycle rule.
- The sanitizer cannot reliably strip metadata or bound decoded resources in the deployed runtime.
- Implementation requires public object URLs, raw browser bytes sent directly to Gemini, or a separate OCR provider call for every turn.
- A learner upload reaches a shared cache or vector index.
- One active-assessment fixture reveals a direct answer.
- A required dependency or service is not already approved.

## Rollback and maintenance

Set `FEATURE_ZYRA_IMAGE_INPUT_V1=0` to hide attachment controls and reject new upload and dispatch requests. Keep text chat active. Do not delete attachment records or bucket contents during rollback; application authorization and the 7-day lifecycle continue to protect them. New formats require threat-model review, decoder support, sanitizer fixtures, provider capability evidence, accessibility coverage, and cache-isolation tests.
