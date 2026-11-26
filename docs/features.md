# Zyx Academy Product Features and Workflows

This catalog documents the active user-facing and operational capabilities of Zyx Academy across Student, Tutor, Admin, Public, Native App, and MCP surfaces.

## 1. Authentication, Profiles, and Account Switching

### Account Switching
- **Saved sessions**: The sidebar account menu keeps up to 5 signed-in Zyx accounts so users can switch sessions without re-authenticating with Google.
- **Native Google account chooser**: On Android builds with `ZyxGoogleAuth`, adding an account opens the Credential Manager chooser; older APKs, iOS, Desktop, and Web use the native system browser flow with session `login_hint`.
- **Session cleanup**: Switching or signing out clears account-scoped TanStack Query caches, private offline reader storage, guarded coding drafts, and active Zyra language overrides.
- **Role redirect**: Signed-in users visiting marketing entry pages redirect directly to their role dashboard on the canonical public origin.

### Profiles and Bilingual Preferences
- **Staff and Student profiles**: Authenticated staff have basic profile access; gamification and Pet Studio are student-only.
- **Editor tabs**: Academic, Privacy, and Appearance tabs save independently; academic drafts survive tab switches and failed saves.
- **Profile completeness**: Inline completeness indicator and mobile-friendly inline dialog actions.
- **Bilingual UI (`id` / `en`)**: Full Indonesian and English interface across student, tutor, admin, and public routes, including bilingual Admin (`/admin/docs`) and Tutor (`/tutor/docs`) documentation hubs.
- **Notification preferences and quiet hours**: Granular activity and email notification categories with atomic saves, confirmation links, signed 30-day one-click unsubscribe tokens, per-account quiet-hour push digests, native push isolation, and signed-in device session revocation. See [notifications.md](notifications.md) and [notifications-quiet-hours.md](notifications-quiet-hours.md).
- **Bilingual first-use tours**: Interactive Indonesian and English onboarding tours for students and tutors.

## 2. Student Learning Experience

### Separated Mobile and Desktop Navigation
- Dedicated desktop and mobile LMS shells (`features/`) with responsive sticky horizontal tabs (`More` / `Lebih` overflow popover), history-backed overlay dismissal, and global `cmdk` search.
- Mobile surfaces include pull-to-refresh, navbar refresh actions, tab icons, meaningful haptics, and OS share/file integration in the Capacitor app.

### Courses, Articles, Diktats, and Videos
- **Structured Articles (V4 default)**: Ordered scientific sections, catalogue-based headings, chapter numbering, decoded canonical product URLs, compact formula rows with KaTeX macros, and subsection navigation.
- **Embedded Learning Visuals**: Always-on typed `zyx-visual` Markdown embeds (interactive function plots, 2D geometry, reading-first graphs with optional parameter controls and explicit interaction activation) plus sandboxed `interactive_document` widgets that preserve state while scrolling and pause offscreen playback.
- **Article selection handoff**: Selecting text on desktop (popover) or mobile (selection action) sends a saved quote directly to Zyra for contextual explanation.
- **Diktat**: Authored 1 to 4 page printable scientific PDFs with inline viewer and authorized download.
- **Standalone Solution Collections (V5)**: Reviewed problem-and-solution collections under `/courses/[id]/solutions/[collectionId]`.
- **Videos**: Course video playlists powered by Vidstack player, streaming via short-lived presigned storage URLs for optimized playback and proxy efficiency.
- **Offline Reader**: Decoupled offline service worker and native offline reader (`/offline`) for saved readings when offline.

### Flashcards, Mastery, and Study Paths
- **SM-2 Flashcards**: Idea-linked spaced-repetition flashcards with flip, grade (1 to 4), due queues, and mastery-based suppression.
- **Chapter Mastery & Study Path**: Per-Idea mastery tracking, concept explorer (`/courses/[id]/concept/[slug]`), chapter-level mastery browsing, topic feedback, and adaptive study paths.
- **Weekly Reflections**: Student reflection journal (`/profile/reflections`) with optional reminder emails (`FEATURE_REFLECTION_EMAIL`).

### Python Learning and Playground
- Editable Python Markdown blocks directly inside student Articles, plus a dedicated viewport-aware Playground (`/courses/[id]/playground`).
- Browser Pyodide execution, staging WASI terminal support, explicit Submit grading, guarded code insertion from Zyra, and beginner-friendly Python coaching. See [coding-foundation.md](coding-foundation.md).

## 3. Assessments, Quizzes, Tryouts, and Live Classroom

### Quizzes and Tryouts
- **Reservation and timing**: Quiz attempts reserve canonical items at start. Untimed quizzes (`timeLimitSeconds: null`) omit countdown timers and expiry effects.
- **Timeout and late submission invariant**: POST `/api/quiz/attempts/[id]` accepts timeout and late submissions and caps the recorded duration at `timeLimitSeconds` when configured, preventing zombie attempts. Drafts are preserved on failed submission and cleared only after server acknowledgement.
- **Answer safety**: Active attempt GET endpoints redact `correct_indices` and stored explanations until submission.
- **Provenance and grading**: Canonical Idea-linked questions record per-Idea mastery evidence; legacy unprovenanced snapshots remain gradeable without attributing Idea evidence. Essays support manual tutor grading.
- **Tryouts**: Multi-chapter timed exams with recovery for interrupted submissions and detailed post-submission summaries.

### Live Classroom (`FEATURE_LIVE`)
- Real-time host and student quiz sessions (`/courses/[id]/live`, `/courses/[id]/live/host`) powered by `workers/realtime` with durable live answers.

### Tutorial PKA (`FEATURE_PKA`)
- Free multi-stage PKA simulation campaign (`/courses/tutorial-pka`), registration, schedules, announcements, and progress reports.

## 4. Zyra AI Tutor and Operations

### Student Tutoring Experience
- **Conversational tutoring**: Live SSE streaming with response progress indicators, article-style KaTeX math rendering, proactive grounded visual exploration, and safe retry handling when generation fails.
- **Contextual follow-ups**: Policy-validated subtle follow-up quick actions and automatic Zyra AI session titles.
- **Multimodal input (`FEATURE_ZYRA_IMAGE_INPUT_V1`)**: Private authenticated learner image uploads with sanitizer validation and persistent thumbnails.
- **Language override**: Temporary per-conversation language switching (in-memory, up to 32 sessions) without mutating account locale.

### Zyra Operations
- **Model configuration (`/admin/ops/models`)**: Dynamic Cloudflare AI Gateway model discovery, 12-hour KV catalog cache, release/creation date sorting, 3-sample median latency probes (12-hour scheduled + manual refresh), global and per-feature model selection, and 5-minute alias cooldown after 3 consecutive failures.
- **AI analytics (`/admin/ops/analytics`)**: Deduplicated usage, latency, error bucket, and allowance telemetry with Asia/Jakarta day boundaries and zero prompt/PII retention.
- **Admin Ops AI Copilot**: Grounded in `admin_ops_knowledge` Vectorize namespace and curated docs; generates 30-minute expiring action proposals requiring explicit admin confirmation before any mutation.

## 5. Discussions, Schedules, Groups, and Gamification

### Bilingual Scoped Discussions
- Course and general discussion channels (`/discussions`, `/courses/[id]/discussions`, `/tutor/discussions`, `/admin/discussions`) with full-text search (GIN indexes), mention handles, emoji status, compact composer with square image thumbnail strips, and `@Zyra` AI dispatch with hardened cooldowns. See [discussions.md](discussions.md).

### Schedules, Bookings, and Google Calendar Sync
- **Role calendars**: Route-owned Student (`/calendar`, `/dashboard/schedule`), Course, Tutor (`/tutor/schedule`), and Admin (`/admin/schedules`) calendars with on-demand week loading, tutor availability configuration, configurable tutorial email reminders, and filtered slot booking.
- **Google Calendar sync**: Personal offline OAuth calendar sync and shared Zyx host primary calendar sync via daily queue dispatch and manual toolbar sync controls.
- **Study Groups & Tokens**: Transactional enrollment token redemption (`Zyx-XXXXXXXX-{capacity}-{courseIds.length}`) forming study groups (`/dashboard/groups`) with shared rosters and booking quotas.

### Student Leaderboard and Social Identity
- **Combined Leaderboard (`/leaderboard`)**: URL-addressable `Rank` (participation XP: week/month/all-time/following) and `Academic` (course-scoped academic ranking) tabs. `/leaderboard/academic` redirects to `?tab=academic`.
- **Achievements & Rewards (`/achievements`)**: Overview, Badges (6 families x 5 tiers), Missions, and Rewards (animated frames, chat skins, Pet Studio items).
- **Pet Studio (`/pet`)**: 4 3D GLB companions (cat free; tiger, rhino, crocodile purchasable with LP) with unique actions and 15 fitted LP suits.
- **Social Identity**: `StudentProfileDialog` and people search (250 ms debounce, 2 to 80 chars, max 10 results) with member visibility, follow/unfollow, block, and report controls. See [gamification.md](gamification.md).

## 6. Tutor and Admin Workflows

### Tutor Surface (`/tutor`)
- Course overview, read-only material list (with Admin authoring override), video management, quiz authoring and attempt review, tryout management, essay grading (`/tutor/[courseId]/grading`), participant roster, live classroom hosting, schedule/slot management, discussions, and bilingual Tutor Docs (`/tutor/docs`).

### Admin Surface (`/admin`)
- **Hybrid domain-grouped sidebar**: Home, Academic & Content (Courses, Materials, Bundles, Schedules, Tutorial PKA, Discussions), Evaluation (Question Bank, Quizzes, Quiz Insights, Distractors, Generation Jobs, Leaderboard), Tools & Communications (Form Studio, Meet, Media Library, Blog, Short Links, Important Links, Pricing & Discounts, Notifications), Users & Access (Users, Groups, Tokens), and System & Ops (Ops Monitor, Models, Analytics, API Keys, Feature Flags, Feature Usage, Web Analytics, Tutor Activity, Admin Docs).
- **Form Studio (`/admin/forms`)**: Revamped Google Forms style builder with less-cards layout, per-question or per-section publication, upload size labels, submission confirmation, and Google Sheets export with attachment URLs.
- **Pricing & Discounts (`/admin/pricing`)**: Admin-managed platform and tutorial discount schedules backed by singleton `pricing_settings`.
- **Course Access Categories**: Admin-managed free/paid course access categories and scheduled free access windows.

### Authoring and Admin MCP (`/api/mcp/authoring`)
- Streamable HTTP MCP endpoint supporting OAuth PKCE with 4 default scopes plus explicit publication and admin consent grants.
- Full canonical workflow: Source Pack ingestion -> Idea Bundle V3 -> Product Bundle V4/V5 -> Flexible stable-ID revisions -> verification -> review -> atomic publication.
- Admin MCP tools for blog, forms, media, schedules, groups, tokens, notifications, and operation receipt recovery. See [operations/admin-mcp.md](operations/admin-mcp.md) and [operations/agent-first-content.md](operations/agent-first-content.md).

## 7. Public Marketing and Interactive Demo

- Marketing routes (`/`, `/about`, `/plans`, `/blog`, `/testimonial`, `/tautan`, `/privacy`, `/terms`, `/f/[slug]`, `/meet/[slug]`).
- **Interactive Public Demo (`/demo`)**: Reuses the exact student shell, course catalog, dashboard, articles, read-only diktats, flashcards, quizzes, tryout, calendar, groups, achievements, leaderboard, and scripted Zyra with first-chapter Free policy and browser-persistent fictional state. See [operations/public-demo-seeding.md](operations/public-demo-seeding.md).
