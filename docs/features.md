# Zyx Academy ; Features & Workflows

## What It Is

Zyx Academy is an AI-powered learning management platform. It takes expert teaching documents, breaks them into atomic concepts, and uses that structure to power personalized learning paths, adaptive flashcards, quizzes, PDF study guides, and one-on-one tutoring.

## User Roles

### Student
- Redeems enrollment tokens to access courses
- Views personalized dashboard with progress, weak concepts, daily recommendations
- Reads interactive course materials (markdown, PDFs, images, embedded video)
- Takes daily/weekly quizzes and timed tryouts
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

## Core Pipelines

### MTD → Knowledge Objects (KO)
1. Admin uploads a markdown master document
2. Gemini extracts atomic KOs ; each a definition, formula, misconception, example, or exercise
3. Each KO tagged with Bloom's level, difficulty, type, LaTeX math
4. KOs synced to vector database for RAG search (`course_{courseId}_learning` namespace)

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
- Weak-concept addendum when student struggles
- Capped at 30 AI requests per day per student

### Question Generation
- Blueprint engine produces per-KO question specs
- Gemini generates draft questions
- Pedagogical validator enforces course policies (forbidden contexts, difficulty caps)
- Distractor mapper links wrong answers to misconception KOs

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

## Money & Quota Rules

- AI quota spent only on: tutoring, mistake feedback, content generation
- Streaks, recommendations, study paths, reflections ; all deterministic SQL
- Students capped at 30 AI requests/day
- KV writes capped at 900/day; reads unrestricted
