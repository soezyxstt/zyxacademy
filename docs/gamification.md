# Gamification, Pet Studio, and Social Identity

Authoritative product and implementation contract for student gamification, Pet Studio, achievements, leaderboards, and public student profiles. Gamification is always-on (no feature flag) and student-only; the admin Gamification page and navigation entry have been removed while retaining server-side checklist helpers and existing student reward data.

## 1. Ranks, XP, and LP

XP and course credits use integer millionths for exact allocation. Each eligible event awards base XP plus a rank bonus calculated from the student's rank prior to the event. LP (Learning Points) is a separate integer currency earned from badge tiers, missions, and eligible discussion answers, and spent in the cosmetics shop and Pet Studio.

| Rank | Total XP Minimum | Course Credits Minimum | Future XP Bonus | Zyra Daily Turn Bonus |
| --- | ---: | ---: | ---: | ---: |
| Rakyat | 0 | 0 | 0% | 0% (15 turns) |
| Kades | 1,000 | 0 | 0% | 0% (15 turns) |
| Camat | 10,000 | 1 | 5% | 5% (15 turns) |
| Bupati | 30,000 | 3 | 10% | 10% (16 turns) |
| Gubernur | 60,000 | 6 | 15% | 15% (17 turns) |
| Presiden | 100,000 | 10 | 20% | 25% (18 turns) |

- The first eligible Zyra allowance read fixes the rank snapshot for the Asia/Jakarta day.
- Approved course checklists allocate reference pools over stable item IDs: Articles (up to 1,000 XP at 10 items), Explanations (up to 1,000 XP at 10 items), Questions (up to 6,000 XP at 300 items), and Flashcards (up to 2,000 XP at 200 items), contributing up to 1 course credit proportional to 10,000 possible XP.
- Discussion rewards award 5 base XP per eligible question (max 5/day) and 10 base XP + 1 LP per eligible answer to another student's question (max 10/day), once per reward kind per thread. Staff, self-answers, replies, forwards, and edits are excluded.

## 2. Achievements and Missions

Six achievement families each have 5 tiers (Bronze through Emerald), awarding 25, 50, 100, 200, and 400 LP per tier:

| Family | Tier Thresholds |
| --- | --- |
| Warrior Reader | 5, 15, 40, 100, 200 |
| Practice Knight | 20, 75, 200, 500, 1,000 |
| Memory Guardian | 25, 100, 300, 750, 1,500 |
| Steady Scholar | 3, 10, 30, 90, 180 |
| Comeback Champion | 5, 20, 50, 150, 300 |
| Consistency Captain | 1, 4, 12, 26, 52 |

Confirmed unread badge and rank awards display in top-center Sonner notifications (persisted atomically with rewards, polled at most once per minute while visible, paused in hidden tabs, and excluded from staff and demo contexts).

## 3. Evidence Integrity and Outbox

- **Quizzes**: Rewardable quiz items require published canonical question, course, version, options, and answer provenance. Exposure history uses an indexed maximum-time projection (`gamification_question_exposure_projection`) per viewer, course, and question so prior disclosures prevent duplicate rewards without blocking grading.
- **Flashcards**: Requires two eligible due recalls of the same card separated by at least 7 days with qualifying grades.
- **Outbox**: Learning facts and receipts flow through `gamification_event_outbox` with idempotent ledger writes (up to 100 events per worker invocation with durable continuation and 5-minute cron recovery).

## 4. Cosmetics and Student Pet Studio

- **Avatar frames (`CollectibleFrame` / `FrameChoreography`)**: 10 illustrated frame collections (`Orbit Zyx`, `Garuda Fajar`, `Samudra`, `Bara Komodo`, `Wayang Kencana`, `Merah Putih`, `Borobudur`, `Khatulistiwa`, `Anggrek`, `Naga`) served as lossless WebP under `public/gamification/collections/frames/`. Student photos remain centered and stable; hero frames animate with reduced-motion and offscreen pause support while small list avatars remain static.
- **Zyra chat skins**: 6 chat skins applied to assistant messages in course chat and defaulted (with explicit override support) in discussion participant bubbles.
- **Student Pet Studio (`/pet`)**:
  - 4 3D GLB companions: Cat (free), Tiger, Rhino, and Crocodile (purchasable with LP), rendered via lazy Three.js (`ZyraMascot3D`) with Meshopt decoding, animation clips, poster fallbacks, 30 fps / 1.5 DPR cap, and offscreen pause.
  - Unique pet actions: Cycling and Jumping (Cat), Roaring (Tiger), Charging (Rhino), Giving Flowers (Crocodile).
  - **15 fitted LP suits**: Shared across the LP shop and `/pet`, fitted to all four pets, priced from 400 LP to 900 LP (including Sports Kit at 500 LP, Space Suit at 750 LP, Graduation Gown at 900 LP).
  - Switching pets keeps the equipped suit and clears any incompatible action. The shop retires earlier procedural characters while preserving historical inventory and LP ledger rows.
- **Catalog seeding**: Reads never seed the catalog. Apply migrations (`0036_student_pet_studio.sql`, `0037_member_profile_visibility.sql`, `0038_discussion_mention_handles.sql`) and run the guarded catalog seed (`scripts/staging/seed-gamification-catalog.ts`) explicitly before releasing dependent web revisions.

## 5. Student Achievements and Social Presentation

- **Leaderboard (`/leaderboard`)**: URL-addressable `Rank` (global/following participation XP by period) and `Academic` (course-scoped academic ranking) tabs. `/leaderboard/academic` redirects to `?tab=academic` preserving query parameters.
- **Achievements (`/achievements`)**: Overview, Badges, Missions, and Rewards tabs.
- **Profiles and People Search**:
  - Public profiles (`/students/[publicId]`) and `StudentProfileDialog` display only authorized public fields (avatar/frame, rank, featured badges, equipped owned Zyra mascot, follow counts, Follow/Unfollow, and Block/Report actions). LP balances, emails, internal IDs, and private academic stats are never public.
  - Member visibility (`0037_member_profile_visibility.sql`), leaderboard opt-in, and bidirectional blocks are enforced server-side.
  - People search runs with 250 ms debounce for 2 to 80 character queries, returning up to 10 public student identities (excluded from staff, marketing, and demo search).
  - Public demo (`/demo`) reuses these exact renderers with browser-local fictional data.
