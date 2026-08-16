# Audit: Personal Learning Companion, AI Tutor, Mastery-Based Learning, AI Study Planner, Adaptive Quiz, Explain My Mistakes

Scope: phase 3 of the 18-use-case audit (student-facing, cluster 1 of 4). Status: scan + gap analysis complete, no code changed.

## 1. Personal Learning Companion ("what should I study today")

**Vision**: daily answer based on schedule, progress, weaknesses, deadlines, target grades, available time.

**Reality**: real and wired. `app/api/student/today/route.ts` + `lib/recommendation-service.ts` build a daily plan from streak, weekly activity, due/new flashcards (capped at 20), a mastery-aware quiz pick via `study-path-service.ts`, and the next uncompleted chapter module. Entirely deterministic SQL, consistent with AGENT_CONTEXT.md's zero-AI-for-recommendations rule.

**Gap**: of the six inputs the vision names, only progress and weaknesses are real. Schedule, deadlines, target grades, and available time are not modeled anywhere in the schema — there's no calendar/exam-date/target-grade/available-hours concept for a student at all. The quiz-selection fallback (no study path) is "any unpassed quiz," not a weakness-weighted choice, so "today" can degrade to generic in that mode.

**Subtasks**:
1. This is mostly a data-modeling gap, not a logic gap: decide which of {deadlines, target grades, available time} are worth adding now. Deadlines (exam dates) is the highest-leverage one since it also unlocks the Study Planner gap below.
2. Make the quiz fallback (when study path is off) weakness-weighted using existing mastery data instead of "any unpassed quiz," since the mastery data it needs already exists.

## 2. AI Tutor that knows the student

**Vision**: tutor responses informed by semester, courses, history, wrong quizzes, unmastered concepts, learning style — not generic.

**Reality**: a real 3-tier hybrid in `lib/tutor-rag.ts`. Tier 1 (the actual grounded answer, KV-cached 7 days) is **fully generic and contains zero per-student data** — it's shared across students by design (cache key has no student dimension). Tier 2 (deterministic) correctly checks the student's real `studentConceptMastery` score and flashcard count for the matched concept. Tier 3 (charged Gemini call) layers a personalized 5-sentence addendum on top, using mastery score + recent struggles — but only fires if Tier 2 found a weak-concept match and budget remains.

**Gap**: the headline claim "not a generic ChatGPT" is true for the addendum, false for the base answer. A student asking a question that doesn't happen to overlap a tracked weak concept gets a 100% generic, cached, non-personalized response — which given the cache is shared cross-student, is by definition not personalized. Separately, `lib/zyra/mastery-memory.ts`'s `getMasteryMemory()` is a stub that always returns empty defaults, so the broader Zyra context-builder pipeline (`lib/zyra/zyra-context-builder.ts`) is silently passing empty mastery data into whatever it's supposed to feed.

**Subtasks**:
1. Fix or finish `getMasteryMemory()` in `lib/zyra/mastery-memory.ts` — confirm whether `zyra-context-builder.ts` callers depend on it returning real data; if so this is a live bug, not just an unfinished feature.
2. Decide if Tier 1's cache-sharing-across-students tradeoff (cheap, fast, but generic) is intentional cost control or an oversight — if intentional, the "knows the student" framing should be scoped to "knows the student when it matters (weak concepts)", not applied to every tutor answer.

## 3. Mastery-Based Learning

**Vision**: per-concept mastery (not chapter 1/2/3).

**Reality**: real and operational, fully deterministic. `studentConceptMastery` is genuinely per-concept; `lib/mastery-engine.ts` computes score/confidence/evidence from `learningEvents`; `lib/mastery-store.ts` adds trend (7-day snapshot comparison) and `blockedBy` (prerequisites under 40). Chapter-level aggregation also exists (`studentChapterMastery`) as a secondary rollup, not the primary unit — matches the vision correctly.

**Gap**: minor. `blockedBy` is computed but the scan didn't find it enforced anywhere in the study path or UI (i.e. nothing currently stops a student from attempting a "blocked" concept) — that may be intentional (informational, not a gate), but worth confirming. Chapter mastery is computed but not returned by `/api/student/mastery`.

**Subtasks**:
1. Confirm whether `blockedBy` is meant to be advisory (just shown) or a real gate (blocks quiz/module access); if advisory, no action needed — if it was meant to gate, it's unwired.

## 4. AI Study Planner ("I have a midterm next week")

**Vision**: input a deadline, get a day-by-day plan.

**Reality**: `lib/study-path-service.ts` does real work — topological sort (Kahn's algorithm with deterministic cycle-breaking) over `knowledgeRelationships` prerequisite edges, ordered by ascending mastery (weakest first), chapter order, and importance, producing locked/available/in_progress/mastered steps with linked module/quiz/flashcard actions and an `estimatedMinutes` per step.

**Gap**: this is a real **concept-ordered study path**, not a **deadline-driven day-by-day plan** — there is no deadline input anywhere, so "I have a midterm next week" literally cannot be expressed to the system today. `estimatedMinutes` exists per step but nothing converts the ordered step list + a deadline into "Day 1: X, Day 2: Y." This is the same missing piece as item 1's "deadlines" gap — one fix serves both.

**Subtasks**:
1. Add a deadline input (even just "exam in N days") to an existing study-path call; bucket the already-ordered, already-time-estimated steps into N day-buckets by cumulative `estimatedMinutes`. The hard part (ordering + time estimates) already exists; this is schedule-packing on top of it, not new sequencing logic.
2. Fix the brittleness already present in the ordering inputs first: quiz-template matching is substring/lowercase matching on conceptName vs. title (fragile), and chapter-material matching assumes one material per chapter when the schema allows many — both will quietly misroute a day's recommended action if not addressed.

## 5. Adaptive Quiz

**Vision**: difficulty adjusts to the student in real time.

**Reality**: **not implemented at all** — this is the one clear "stub/missing" finding in this cluster. `app/api/quiz/attempts/route.ts` selects questions upfront from a **fixed** `difficulty_proportions` (e.g. 30/50/20) baked into the quiz template, shuffles them, and that's the whole quiz — no mid-quiz adaptation, no per-student difficulty tuning. `aiQuestionBank.useCount` exists in the schema but is never incremented anywhere, which reads like an adaptive-difficulty feature that was planned (a usage-frequency signal) and abandoned before being wired up.

**Gap**: "Adaptive Quiz" as a label is currently inaccurate — what exists is "configurable fixed-difficulty-mix quiz." Building true adaptivity (re-routing question selection mid-attempt based on running performance) is a real feature gap, not a bug fix.

**Subtasks**:
1. Decide the adaptivity granularity wanted: per-question (IRT-style, complex) vs. per-quiz-attempt (use the student's existing concept mastery score, already computed elsewhere, to bias the *next* quiz's difficulty mix instead of using the template's static default) — the latter reuses existing mastery data and is far cheaper to build.
2. Either wire up `aiQuestionBank.useCount` to something real or remove it — right now it's a dead field that signals an abandoned feature.

## 6. Explain My Mistakes

**Vision**: explain *why* the student reasoned incorrectly, not just give the right answer.

**Reality**: real and well-built, a genuine hybrid. `lib/mistake-feedback.ts` tiers wrong answers into: (a) deterministic hits when the wrong option is tagged to a `misconception` KO (extracts real misconception content, zero AI cost), (b) KV cache hits for previously-seen (question, wrong-answer) pairs (30-day TTL), (c) fresh Gemini batch calls for the rest, explicitly prompted to explain *why* the answer is wrong and identify the misconception/mathematical error, run as an Inngest background job (`feedbackWorker`), not synchronously in the request — this is the correct async pattern, notably better than the upload pipeline audited earlier.

**Gap**: minor. The Gemini failure fallback is a generic, unhelpful placeholder ("Penjelasan otomatis gagal dibuat") with no specifics. The tutor prompt also defines Socratic follow-up questions (`socraticGuidance`) that are generated but apparently never surfaced in the feedback payload shown to students — generated and discarded.

**Subtasks**:
1. Improve the failure fallback to at least show the correct answer + a generic "we couldn't generate a detailed explanation" rather than a dead-end message.
2. Either surface `socraticGuidance` in the student-facing feedback UI or stop generating it (it's wasted Gemini spend either way, which matters given the AI-quota philosophy in AGENT_CONTEXT.md).

## Cross-cluster observation

This cluster is the strongest part of the platform so far: 4 of 6 items (Companion, Mastery, Planner, Mistakes) are real, deterministic where the philosophy calls for deterministic, and only have targeted gaps. The two weak points are structurally different from each other: **Adaptive Quiz is a genuine missing feature** (not broken, just never built past a fixed-proportion baseline), while **the AI Tutor's "knows the student" claim is overstated for its base-answer tier** (the personalization exists, but only conditionally layers on top of a generic cached answer, and one upstream function (`getMasteryMemory`) is a confirmed stub). Both are worth fixing, but they require different kinds of work — one is new sequencing logic, the other is closing a gap between what's documented/marketed and what the cached fast-path actually does.
