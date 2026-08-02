# Zyx Academy ; Features & Workflows

## What It Is

Zyx Academy is an AI-powered learning management platform. It takes expert teaching documents, breaks them into atomic concepts, and uses that structure to power personalized learning paths, adaptive flashcards, quizzes, PDF study guides, and one-on-one tutoring.

## User Roles

### Student
- Redeems enrollment tokens to access courses
- Views personalized dashboard with progress, weak concepts, daily recommendations
- Reads interactive course materials (markdown, PDFs, images, embedded video)
- Takes daily/weekly quizzes and timed tryouts
- Views dedicated AI-powered Quiz Learning Analytics & Diagnosis page (`/summary`) upon quiz completion (3-layer executive summary, deterministic concept mastery, AI error pattern detection, cognitive skill breakdown, time/speed insights, and personalized 3-step action plan)
- Reviews flashcards with SM-2 spaced repetition
- Chats with AI tutor for concept help
- Books real tutor sessions
- Participates in live classroom quizzes
- Views leaderboard and answer keys

### Teacher
- Sets weekly availability for student consultations
- Triggers AI-generated quiz templates, curates questions before publishing
- Grades essays and provides feedback
- Compiles course chapters into structured Diktat PDFs
- Hosts live quiz sessions

### Admin
- Generates enrollment tokens with capacity and expiry
- Manages file drive (Google Drive-style folder tree)
- Uploads Master Teaching Documents (MTDs)
- Runs AI extraction pipeline to decompose documents into Knowledge Objects
- Curates global question bank (5-state moderation grid)
- Monitors background sync queues and usage budgets
- Imports learning/assessment bundles (split JSON pipeline)
- Manages PKA tutorial campaign (stages, schedules, announcements)
- Manages career path templates
- Monitors content quality flags (auto-detected issues)
- Views coaching analytics dashboards
- Accesses dedicated Quiz & Exam Analytics & Insight portal (`/admin/ai/quiz-insights`) for real-time item/distractor analysis and on-demand Gemini AI deep pedagogical insights
- Monitors real-time feature flag statuses (`/admin/ops/flags`) across all 28+ `FEATURE_*` flags with status badges, category filters, and env key helpers

## Core Pipelines

### MTD → Knowledge Objects (KO)
1. Admin uploads a markdown master document
2. Preprocessed and normalized with deterministic semantic chunking preserving headings, formulas, and tables without 30k char truncation
3. Gemini extracts candidates per chunk with source spans, exact excerpt hashes, and learning objectives (with Bloom Taxonomy)
4. Cross-chunk reconciliation deduplicates concepts while preserving all supporting source spans
5. Canonical concept resolution checks exact names, aliases, and flags high embedding similarity without exact match as `ambiguous`
6. Run validated and assigned state (`staged`, `accepted`, `needs_review`, `failed`)
7. Accepted runs persisted atomically using stable identity keys (`stableKey`) without destructive deletion

### Website Material Generation
1. All KOs for a chapter are collected in order
2. Gemini compiles them into canonical markdown with custom containers (`:::concept`, `:::formula`, `:::misconception`)
3. Custom compiler parses markdown → AST → interactive web page
4. Math formulas extracted into interactive parameter sheets

### Flashcards (SM-2 Spaced Repetition)
- Cards auto-generated from KOs per chapter
- SM-2 algorithm schedules reviews with recall grades 1;4
- Ease factor adjusts card difficulty dynamically
- Safety floor recovery prevents forgetting after long intervals

### AI Tutor (RAG)
- Three-tier grounded pipeline: KV cache → vector search → Gemini
- Query Action Router (`retrieve`, `reuse_previous_evidence`, `answer_from_conversation`, `clarify`) with response style modifier extraction (`simpler`, `analogy`, `worked_example`, `graph`, etc.)
- Tier 1 Shared KV Cache isolation ensuring zero student identity, user ID, or conversation history is stored in shared cache payloads
- Versioned prompt contracts, policy contracts, and evidence version digests in cache keys
- Weak-concept addendum when student struggles
- Capped at 30 AI requests per day per student

### Question Generation & Bank Soal Management
- Multi-format question support: Pilihan Ganda (`multiple_choice`), Pilihan Ganda Kompleks (`multiple_choices`), Isian Singkat (`short_answer` with comma-separated acceptable answers), and Uraian/Essay (`essay` with reference rubric).
- Deterministic multidimensional blueprint engine produces per-slot specs identifying KO, cognitive process, target difficulty, reasoning pattern, and targeted misconceptions
- Gemini generates candidate options with stable option IDs (`opt_0`..`opt_3`)
- Application option shuffle with stored seed prevents position leakage and updates correctIndices and distractor provenances deterministically
- Machine-readable distractor provenance engine maps non-correct options with targeted misconception family, method, score, and uncertainty state (`confident`, `ambiguous`, `unknown`)
- Bulk Markdown Importer supports multi-format tags (`**Tipe:** Pilihan Ganda | Isian Singkat | Essay`) and `**Jawaban:**` parsing for short answers.
- Audit trail stored in `question_generation_runs` and `distractor_provenance`
- Generated questions persisted with `qualityScore: null` (unverified) until independent verification

### Diktat PDF Compilation
- Teacher selects chapters
- System fetches KOs, formats into JSON config
- HTML rendered with KaTeX math
- Puppeteer compiles to A4 PDF, uploaded to R2

### Bundle Import Pipeline
- Split JSON format: Learning Bundle (chapters, KOs, flashcards) + Assessment Bundle (exams)
- Learning Bundle imported first to create course/chapter shell
- Assessment Bundle references chapters by title (not $id)
- Incremental re-import with upsert/append/create modes
- Post-processing: concept mapping, vector sync, assessment profile recompute

### PKA Tutorial Campaign
- Free multi-stage simulation for incoming freshmen
- Stages: Matematika, Fisika, Kimia with quiz mappings
- Gated enrollment intake with student registration
- Google Meet review session scheduling
- Admin broadcast announcements

### Learning Outcomes & Career Paths
- CPL/CPMK/Sub-CPMK hierarchy mapped to concepts
- Career path templates with concept prerequisites
- All deterministic SQL, no AI calls

### Content Quality Monitoring
- Auto-detected quality flags: too_easy, too_hard, dead_distractor
- Pedagogical validation against course policies

### Blog & Short Links
- Multi-category blog (tips_kuliah, pojok_kampus, fakta_seru, kegiatan_zyx)
- URL shortener (zyxacademy.com/s/[slug])

### Assessment Integrity & Assistance Policy
- Active attempt answer protection: GET `/api/quiz/attempts` and `/api/quiz/attempts/[id]` strip `correct_indices`, stored explanations, and grading feedback during in-progress attempts.
- Deterministic assistance policy engine (`lib/assessment-assistance-policy.ts`): gates AI tutor and mistake feedback based on activity kind (study, practice, quiz, simulation, exam), attempt state, answer release state, and match state.
- Answer release state matrix: active attempts enforce `socratic_only` or `refuse_answer_reveal`; completed attempts follow release settings (`hidden`, `rationale_only`, `released`).

## Money & Quota Rules

- AI quota spent only on: tutoring, mistake feedback, content generation
- Streaks, recommendations, study paths, reflections ; all deterministic SQL
- Students capped at 30 AI requests/day
- KV writes capped at 900/day; reads unrestricted
