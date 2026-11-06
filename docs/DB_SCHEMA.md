# Zyx Database Schema Reference

This document catalogs the application schema. Staging uses the PostgreSQL tables in [db/schema.ts](../db/schema.ts) and generated migrations in `drizzle-postgres/`. Production retains its previous SQLite/Turso schema and code.

Legacy SQLite SQL and storage-type descriptions below remain historical reference. Use `db/schema.ts` and `drizzle-postgres/` for exact staging column types and constraints.

---

## Staging schema compatibility

Generated PostgreSQL migration `0002_classy_onslaught.sql` follows the staging SQLite schema at `37e64074d57fe92177c8d9334dc598850000331e`. It adds:

| Table | Contract |
| --- | --- |
| `account_locale_preferences` | One locale per auth user, restricted to `id` or `en`; update time is `timestamptz`. |
| `coding_problems` | Composite problem ID/version, canonical course and creator foreign keys, private JSONB snapshot, positive version and draft/published status. |
| `coding_attempts` | Learner and canonical course foreign keys, idempotent request index, JSONB request/evaluation, positive attempt ordinal, surface and status checks. The import rejects pending attempts. |
| `coding_drafts` | Composite learner/course/draft key, code/stdin, numeric revision and `timestamptz` update time. |

The booking slot constraint now matches staging: a partial unique index permits cancelled history while allowing only one non-cancelled booking per slot. This preparation brings the PostgreSQL schema to 193 application tables; it does not deploy the newer staging application or apply changes to the rehearsal database.

---

## High Level Overview

The rehearsal uses PostgreSQL while existing deployments retain SQLite/Turso. Migrations are managed via Drizzle ORM.
- **Time representation**: PostgreSQL timestamps map to JavaScript `Date` objects. The importer normalizes legacy integer timestamps under its explicit mixed-unit policy.
- **Foreign Keys**: Cascade deletes are used extensively to maintain integrity across course-specific content.
- **Coverage note**: `db/schema.ts` is authoritative; this document documents every table's columns. When this document and `db/schema.ts` disagree, trust `db/schema.ts`.

---

## 1. Authentication Domain (Better-Auth)

### user
* `id`
* `name`
* `email`
* `emailVerified`: Boolean flag indicating whether the user's email has been verified.
* `image`: URL of the user's profile avatar.
* `role`: Temporary compatibility projection, which can be 'admin', 'teacher', or 'student' during the expand phase. Canonical authorization always uses `pengguna_peran`.
* `createdAt`
* `updatedAt`

### emailNotificationPreferences
* `userId`: Primary key and cascading foreign key to `user.id`.
* `emailEnabled`: Master control for all optional email categories.
* `courseUpdates`: Course publication and announcement emails.
* `eventsAndSchedules`: Course event, schedule, and meeting emails.
* `learningReminders`: Study and reflection reminder emails.
* `newsAndOffers`: Zyx news and promotional emails.
* `createdAt`
* `updatedAt`

The row is created on the first explicit save or unsubscribe. A missing row derives initial course and event values from the legacy Tutorial PKA `receiveAnnouncements` choice; learning reminders default on and news and offers default off. This table never controls essential account, security, payment, or enrollment email.

### accountLocalePreferences
* `userId`: Primary key and cascading foreign key to `user.id`.
* `locale`: Presentation locale constrained to `id` or `en`.
* `updatedAt`: Last preference update time, stored as Unix milliseconds.

This table keeps a user's interface language separate from authorization, course learning preferences, and authored content. It is defined by `db/schema.ts` and the additive Drizzle migration `drizzle/0098_workable_blue_blade.sql`. A guarded, read-only staging schema query on 2026-10-24 found no `0098` ledger entry and no `account_locale_preferences` table, so the migration is pending on that staging database. No staging or production migration was applied. See `artifacts/bilingual/staging-preflight-locale-0098.json` for the non-secret fingerprint, guarded query outcome, and environment-file limitation.

### session
* `id`
* `userId`
* `token`: Unique session token stored on the client.
* `expiresAt`: Timestamp when the login session expires.
* `ipAddress`: IP address of the user when session was initiated.
* `userAgent`: Browser user-agent string.
* `createdAt`
* `updatedAt`

### account
* `id`
* `userId`
* `accountId`: Provider-specific unique identifier.
* `providerId`: Identity provider (e.g. google, credentials).
* `accessToken`: OAuth access token.
* `refreshToken`: OAuth refresh token.
* `idToken`: OAuth OpenID Connect ID token.
* `expiresAt`: Access token expiration timestamp.
* `password`: Hashed password for email/password sign-in.
* `createdAt`
* `updatedAt`

### verification
* `id`
* `identifier`: Target of verification (e.g., email address).
* `token`: Secure verification token sent to the user.
* `expiresAt`: Verification link expiration timestamp.
* `createdAt`
* `updatedAt`

### pengguna
* `id`: One-to-one primary key and `RESTRICT` foreign key to `user.id`.
* `status`: Domain identity status, currently `active` or `suspended`.
* `createdAt`
* `updatedAt`

### peran
* `id`: Stable immutable role identifier.
* `code`: Canonical access role, `admin`, `tutor`, or `murid`.
* `createdAt`

### pengguna_peran
* `id`: Deterministic membership identifier for backfilled rows.
* `penggunaId`: Domain identity foreign key.
* `peranId`: Canonical role foreign key.
* `source`: Provisioning or migration source.
* `auditActorPenggunaId`: Optional course-independent domain audit actor.
* `createdAt`
* `(penggunaId, peranId)` is unique. The table supports multiple roles for one identity.

---

## 2. Course & Enrollment Domain

### courses
* `id`
* `title`
* `description`
* `category`: Categorization indicating the major or study field (from a predefined set of majors).

### enrollments
* `id`
* `userId`
* `courseId`
* `expiryDate`: Lock timestamp for student enrollment limits (usually ends with the current semester).
* `createdAt`
* `updatedAt`

### groups
* `id`
* `name`: Study group name (e.g. Kelompok Belajar Alpha).
* `packageType`: Package tier ("reguler_15", "intensif_30", "super_intensif_45", "custom").
* `packageName`: Display package label (e.g. Paket Reguler (15 Sesi)).
* `totalQuotaSessions`: Number of sessions in the group package (default 15).
* `usedQuotaSessions`: Package sessions used. Booking consumes one session and a student cancellation returns one session.
* `weeklyQuotaSessions`: Target sessions per week. Weekly usage counts bookings in the Jakarta week and excludes cancellations that have a refund marker.
* `academicYear`: Academic year string (e.g. 2026/2027).
* `semester`: Active semester label (e.g. Ganjil, Genap, Pendek).
* `startDate`: Semester start timestamp.
* `endDate`: Semester end timestamp.
* `status`: Group lifecycle status ("active", "completed", "inactive", "archived").
* `notes`: Administrative notes and context.
* `createdAt`
* `updatedAt`

### groupCourses
* `id`
* `groupId`: Foreign key to `groups.id`.
* `courseId`: Foreign key to `courses.id`.
* `createdAt`

### groupMembers
* `id`
* `groupId`: Foreign key to `groups.id`.
* `userId`: Foreign key to `user.id`.
* `role`: Member role within the group ("leader", "member").
* `joinedAt`

### enrollmentTokens
* `id`
* `groupId`
* `token`: Pre-generated unique registration token.
* `capacity`: Maximum number of times the token can be claimed.
* `createdAt`
* `expiresAt`: Date after which the token becomes invalid.

### enrollmentTokenCourses
* `tokenId`: Foreign key to `enrollment_tokens.id`.
* `courseId`: Foreign key to `courses.id`.

---

## 3. Tutor & Scheduling Domain

### tutorCourses
* `id`
* `tutorId`
* `courseId`

### tutorSlots
* `id`
* `tutorId`
* `dayOfWeek`: Day name ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu').
* `startTime`: Session start time in HH:MM format (e.g. "09:00").
* `endTime`: Session end time in HH:MM format (e.g. "10:30", 90 minutes).
* `mode`: 'online' or 'offline'.
* `location`: Physical room or branch location when offline.
* `sessionDate`: Concrete ISO date string (YYYY-MM-DD) for new canonical bookable slots. Nullable only for legacy rows, which are excluded from normal student availability.
* `createdAt`
* Indexes: `(tutorId)`, `(tutorId, sessionDate)`, and exact concrete duplicate protection on `(tutorId, sessionDate, startTime, endTime)`.

Canonical policy: tutor availability for the following week opens Monday and closes Friday at 18:00 WIB. Copying a previous week creates concrete dated rows. A null `sessionDate` row is legacy compatibility data only, never a preferred recurring-slot mechanism, and must not be assigned a guessed date.

### bookings
* `id`
* `slotId`: Reference to the tutor slot. A partial unique index allows one non-cancelled booking per slot. Cancelled bookings keep their slot reference and history.
* `studentId`: Student user ID who initiated the booking.
* `courseId`: Course associated with the session.
* `groupId`: Study group that owns the booking.
* `status`: 'scheduled', 'completed', 'cancelled', or 'rescheduled'.
* `sessionDate`: Exact session date (YYYY-MM-DD).
* `startTime`: Session start time (HH:MM).
* `endTime`: Session end time (HH:MM).
* `mode`: 'online' or 'offline'.
* `location`: Offline physical venue description.
* `googleMeetUrl`: Automated Google Meet session URL for online sessions.
* `googleMeetSpaceName`: Google Meet space resource identifier.
* `lastModifiedBy`: User ID of the student/tutor who last modified the booking.
* `lastModifiedAt`: Timestamp of last modification for audit banner.
* `topic`: Discussion topic submitted by students before the session.
* `preSessionNotes`: Question notes entered by group members.
* `preSessionAttachments`: JSON array of problem files (PDF, images) with uploader identity and timestamp.
* `postSessionNotes`: Tutor summary and recap notes.
* `postSessionAttachments`: JSON array of tutor notes (handwritten photo notes or PDF files).
* `postSessionLinkUrl`: External learning material link URL.
* `postSessionLinkTitle`: External link title.
* `postSessionLinkDescription`: External link summary description.
* `postSessionLinkImage`: External link preview image.
* `completedAt`: Timestamp when marked complete by tutor.
* `completedById`: Tutor user ID who marked the session completed.
* `bookedAt`: Initial creation timestamp.

### bookingResources
* `id`
* `bookingId`: Foreign key to `bookings.id`; resources are deleted with the booking.
* `phase`: 'pre' or 'post', indicating when the resource belongs to the session workflow.
* `kind`: 'link', 'file', or 'recording'.
* `label`: Human-readable resource label.
* `url`: Resource URL or storage proxy URL.
* `fileName`: Optional original file name.
* `mimeType`: Optional MIME type.
* `sizeBytes`: Optional non-negative file size.
* `metadata`: Optional JSON metadata.
* `createdById`: Foreign key to `user.id` for the resource creator.
* `createdAt`, `updatedAt`
* Indexes: `bookingId`, `(bookingId, phase)`, and `createdById`.
* Existing booking attachment and post-session link fields remain readable during the additive migration. Read models merge them into the normalized resource representation.

Legacy tutor slots with a null `sessionDate` are not assigned an invented recurring date. The guarded `backfillBookedNullTutorSlotDates` helper may backfill a booked legacy slot only when its booking supplies one unambiguous valid date and no same-tutor conflict exists. Unbooked null-date rows remain legacy cleanup data.

### bookingAuditLogs
* `id`
* `bookingId`: Reference to `bookings`.
* `groupId`: Reference to `groups`.
* `actorId`: Reference to `user` (student, tutor, or admin).
* `action`: Action type ('BOOK_CREATED', 'SLOT_MOVED', 'TOPIC_UPDATED', 'ATTACHMENT_UPLOADED', 'RESCHEDULE_REQUESTED', 'RESCHEDULE_APPROVED', 'RESCHEDULE_REJECTED', 'BOOKING_CANCELLED', 'BOOKING_CANCELLED_QUOTA_REFUNDED', 'SESSION_COMPLETED', 'NOTES_ADDED', 'ADMIN_TUTORIAL_SESSION_ASSIGNED', 'ADMIN_TUTORIAL_SESSION_MOVED', 'ADMIN_TUTORIAL_SESSION_CANCELLED').
* `summary`: Human-readable activity sentence.
* `metadata`: JSON payload containing action details.
* `createdAt`

Admin scheduling overrides also write the existing `audit_mutasi` envelope with actor, action, reason, before snapshot, after snapshot, request ID, and timestamp. Admin calendar reads are scoped to the visible tutorial week; null-date legacy slots may only contribute to the compatibility warning count.

### bookingRescheduleTickets
* `id`
* `bookingId`: Reference to `bookings`.
* `groupId`: Reference to `groups`.
* `requestedById`: Student user ID who requested the ticket.
* `tutorId`: Tutor user ID.
* `type`: 'reschedule' or 'cancellation'.
* `status`: 'pending', 'approved', or 'rejected'.
* `reason`: Reason submitted by the student group.
* `proposedSlotId`: Target new slot requested.
* `proposedDate`: Target new date requested.
* `decisionNotes`: Notes provided by the tutor upon approval or rejection.
* `decidedAt`: Timestamp of decision.
* `decidedById`: User ID of the decider.
* `createdAt`, `updatedAt`

### bookingTicketMessages
* `id`
* `ticketId`: Reference to `bookingRescheduleTickets`.
* `senderId`: Reference to `user`.
* `message`: Text content of discussion message.
* `createdAt`

### academicSchedules
* `id`
* `type`: 'official_exam', 'tryout', 'quiz', or 'general'.
* `title`: Title of the academic event (e.g. "UTS Kalkulus 1 ITB").
* `courseId`: Optional reference to `courses`.
* `description`: Academic event description.
* `startDate`: Start timestamp.
* `endDate`: End timestamp.
* `location`: Venue or meeting link.
* `createdById`: Admin user ID who created the event.
* `status`: 'published', 'draft', or 'archived'.
* `createdAt`, `updatedAt`

---

## 4. File Management Domain

### driveItem
* `id`
* `name`: File or folder display name.
* `type`: Flag specifying item type, either 'folder' or 'file'.
* `parentId`: Reference to parent `driveItem` to establish hierarchical file-tree navigation.
* `fileUrl`: Public URL path if the item is a uploaded file.
* `uploadthingKey`: Key pointer referencing files stored in Uploadthing storage.
* `createdAt`
* `updatedAt`

---

## 5. Content Architecture (vNext Core Engine)

### masterTeachingDocuments (MTDs)
* `id`
* `courseId`
* `title`
* `type`: Document category, distinguishing between 'learning' (textbooks, notes) and 'assessment' (exams, tutorials).
* `sourceMarkdown`: Original markdown file content containing canonical information.
* `sourceHash`: Hash generated from raw content, used for duplicate detection.
* `derivedHash`: Hash generated from parsed structured nodes, verifying extraction integrity.
* `version`: Document revision version.
* `originalPdfKey`: Key referencing the uploaded raw source PDF in storage.
* `canonicalMarkdownKey`: Key referencing the cleaned markdown file.
* `status`: Document publishing state ('draft', 'active', 'archived').
* `createdAt`
* `updatedAt`

### chapters
* `id`
* `courseId`
* `name`
* `order`: Placement index determining how chapters are ordered in navigation.
* `createdAt`
* `updatedAt`

### knowledgeObjects (KOs)
* `id`
* `mtdId`
* `courseId`
* `chapterId`
* `koId`: Semantic unique identifier used as a reference inside materials.
* `conceptName`: Concept slug linking the KO to a canonical concept.
* `title`
* `rawMarkdown`: Markdown snippet containing the raw learning content for this KO.
* `bloomLevel`: Cognitive capability required, ranging from 'remember' to 'create'.
* `importance`: Rating score ('low', 'medium', 'high') reflecting material significance.
* `difficulty`: Difficulty tier metric ranging from 1 to 5.
* `createdAt`
* `updatedAt`

### knowledgeRelationships
* `id`
* `sourceKoId`: Starting KO node.
* `targetKoId`: Destination KO node.
* `type`: Edge relationship type ('prerequisite', 'related', 'extends', 'example_of', 'misconception_of').

### concepts
* `id`: Canonical primary key name serving as concept identifier slug.
* `createdAt`

### conceptLocalizations
* `id`
* `conceptId`
* `language`: Language code of localized data (e.g. 'id', 'en').
* `displayName`: Localized term shown in user interfaces.
* `aliases`: Alternative naming list stored as a JSON string array.
* `embedding`: Normalized high-dimensional text embedding representation.

## 5.1 Canonical Source and Idea Domain

Plan 003 adds these tables without changing legacy courses, chapters, enrollments, tutor assignments, KOs, source spans, relationships, or the global `concepts` registry.

### mata_kuliah
* `id`, `code`, `title`, `status`, `isDemo`
* `legacyCourseId`: Optional compatibility reference to `courses.id`.
* `isDemo`: Boolean marker for the legacy singleton admin demo selection, separate from the public snapshot allowlist. A partial unique index allows at most one row with `isDemo = true`; archived or incomplete courses are not eligible for selection.
* `createdAt`, `updatedAt`
* Admin course create and update mirror `courses` and `mata_kuliah` transactionally. Admin delete removes the legacy projection and archives the canonical row.
* Admin demo selection validates the first active `bab` and its published Article, Diktat, Flashcard, and Kuis requirements before clearing and setting the marker in one transaction.

### bab
* `id`, `mataKuliahId`, `code`, `title`, `orderIndex`, `status`
* `legacyChapterId`: Optional compatibility reference to `chapters.id`.
* `(mataKuliahId, code)` and `(mataKuliahId, orderIndex)` are unique.
* Admin chapter create, update, and reorder mirror `chapters` and `bab` transactionally. Admin delete removes the legacy projection, moves the canonical row out of the active order range, and archives it.

### pendaftaranMurid
* `id`, `penggunaId`, `mataKuliahId`, `status`
* `startAt`, `endAt`
* `legacyEnrollmentId`: Optional compatibility reference to `enrollments.id`.

### penugasanTutor
* `id`, `penggunaId`, `mataKuliahId`, `status`, `assignmentScope`
* `legacyTutorCourseId`: Optional compatibility reference to `tutor_courses.id`.
* Replacing tutor course certifications revokes the previous canonical course assignments, replaces `tutor_courses`, and reactivates the selected `penugasan_tutor` rows in one transaction.

### sumberMateri
* `id`, `mataKuliahId`, optional `babId`, `sourceType`, `title`
* `canonicalUriOrR2Key`, `version`, `checksum`, `status`
* `creatorId`, `createdAt`, `updatedAt`

### potonganSumber
* `id`, `sumberMateriId`, `sourceVersion`, `content`
* `pageNumber`, `sectionLocator`, `startOffset`, `endOffset`, `checksum`
* `embeddingEligible`, `createdAt`, `updatedAt`
* Source offsets must be non-negative and `endOffset` must be greater than `startOffset`.

### ide
* `id`, `mataKuliahId`, `babId`, optional `conceptId`, `stableKey`, `code`
* `canonicalStatement`, `conciseExplanation`, optional `latex`
* `knowledgeKind`, `instructionalRole`, `difficultyMetadata`, `version`, `status`
* `sourcePolicy`, `schemaVersion`, `semanticHash`, `generationHash`
* `creatorId`, optional `curatorId`, `createdAt`, `updatedAt`
* `stableKey` is unique. No provider-specific vector identifier is stored.

### asalIde
* `id`, `ideId`, `sourceChunkId`, `provenanceRole`
* `startOffset`, `endOffset`, `sourceChecksum`, optional `note`
* The Idea, source chunk, and exact span tuple is unique.

### relasiIde
* `id`, `sourceIdeaId`, `targetIdeaId`, `relationType`, optional `explanation`
* `version`, `status`, `createdAt`, `updatedAt`
* Self-relations are rejected by a database check. Active prerequisite cycles are rejected by the contract layer.

### ketergantunganProduk
* Upstream and downstream entity type, ID, version, and hash fields.
* `freshness`: `UP_TO_DATE`, `NEEDS_REVIEW`, or `STALE`.
* `reason`, `createdAt`, `updatedAt`

### petaIdLegacy
* `legacyTable`, `legacyId`, `targetTable`, `targetId`
* `mappingVersion`, `sourceChecksum`, `targetChecksum`, `runId`
* Legacy and target identity pairs are each unique.

### chapterAliases
* `id`
* `chapterId`
* `aliasName`: Text variation of chapter name, used to automatically map raw text mentions to chapters.
* `createdAt`

## 5.2 Product, Assessment, Evidence, and Bundle Domain

Plan 004 adds the normalized target tables below. Plan 005 owns deterministic mapping and backfill. Existing English product, assessment, attempt, flashcard, learning-event, and mastery tables remain active and authoritative for reads during the expand phase.

### Product tables

Canonical published products share a common shape: versioned rows with `status` lifecycle, `generationHash`, creator and optional curator attribution, and typed Idea links.

### artikel
* `id`, `mataKuliahId`, optional `babId`
* `slug`, `title`, `contentMarkdown`, `structureStatus`, `version`, `status`
* `sourceHash`, `generationHash`
* `creatorId`, optional `curatorId`, `publishedAt`, `createdAt`, `updatedAt`
* `structureStatus` is `legacy_unreviewed`, `structured`, or `needs_reauthoring`. Structured content keeps deterministic Markdown for compatibility and indexing.

### artikel_ide
* `id`, `artikelId`, `ideId`, `weight` (default 1)
* Article-to-Idea coverage links used by quality gates.

### blok_artikel
* `id`, `artikelId`, optional `bagianArtikelId`, `blockKey`, `blockType`, optional `title`, `orderIndex`, `content`
* `version`, `generationHash`, `status`, `createdAt`, `updatedAt`
* Ordered typed blocks compiled through the article quality contract.

### bagian_pembelajaran and bagian_pembelajaran_ide
* Learning outline rows store stable hierarchy, title, slug, order, objective, course, chapter, version, and publication status.
* Membership rows connect every Idea to one primary learning section and optional supporting sections.

### bagian_artikel
* Versioned Article section rows store kind, optional learning section, optional parent, title, slug, objective, order, reading estimate, and status.
* Unique Article slug and order constraints preserve stable navigation.

### blok_artikel_ide and blok_artikel_sumber
* Junctions preserve block to Idea and block to exact source provenance without embedding metadata in Markdown.

### kemajuan_baca_artikel
* One row per user, Article, Article version, and section stores maximum read percent, elapsed seconds, last read time, and optional completion time.

### diktat_materi
* `id`, `mataKuliahId`, optional `babId`
* `title`, `contentMarkdown`, optional `fileKey`
* `version`, `status`, `sourceHash`, `generationHash`
* `creatorId`, optional `curatorId`, `publishedAt`, `createdAt`, `updatedAt`

### diktat_ide
* `id`, `diktatMateriId`, `ideId`, `weight` (default 1)

### soal
* `id`, `mataKuliahId`, optional `babId`
* `questionType`, `prompt`
* `optionsSnapshot`: JSON options including stable IDs; correct-answer markers live only here and are redacted from runtime and vector payloads.
* `origin`: `zyx_original` (default), `historical_reference`, or legacy-readable `itb_example`. Historical rows keep source attribution, answer provenance, and solution provenance in canonical fields.
* `assessmentSourceId`, optional `sourceQuestionNumber`, `sourceQuestionPart`, `sourcePage`, and `sourceLocator` identify the historical assessment source and exact question location.
* `answerProvenance` and `solutionProvenance` use `official`, `source_solution`, `zyx_generated`, or `unavailable`.
* `quizEligible`: Runtime eligibility gate. Historical rows default to false and become eligible only when the question type and evaluability rules pass.
* `version`, `status`, `difficulty`, `cognitiveLevel`, `reasoningPattern`, `generationHash`
* `creatorId`, optional `curatorId`, `publishedAt`, `createdAt`, `updatedAt`

### soal_ide
* `id`, `soalId`, `ideId`, `weight`
* `role`: default `supporting`.
* Weights are positive and must sum to one per question (service-validated within `0.000001`).

### question_reference_links
* `id`, `questionId`, `referenceQuestionId`, `role`, optional `notes`, `createdAt`
* `referenceQuestionId` points to another canonical `soal` row. New reference links target only `historical_reference` rows in the same course; legacy `itb_example` rows remain readable through compatibility paths but are rejected for new links. Self-links and duplicate links are rejected by the authoring service.
* `role` is `inspired_by`, `adapted_from`, or `derived_from`. The table is additive and does not replace `soal_ide` attribution.

### soal_relasi_ide
* `id`, `soalId`, `ideId`, `relationType`, optional `rationale`
* `status`: default `active`.
* Per-Idea relation metadata for multi-Idea questions; not attached to the first link implicitly.

### pembahasan_soal
* `id`, `soalId`, `version`, `content`, `status`, `generationHash`
* `creatorId`, optional `curatorId`, `publishedAt`, `createdAt`, `updatedAt`
* Exactly one solution per question enforced by the bundle contract.

### diktat_pembahasan
* `id`, `diktatMateriId`, `title`, `content`
* `version`, `status`, `generationHash`
* `creatorId`, optional `curatorId`, `publishedAt`, `createdAt`, `updatedAt`

### item_diktat_pembahasan
* `id`, `diktatPembahasanId`, `soalId`, `orderIndex`
* Optional `contentSnapshot`, `createdAt`

### Canonical flashcard tables

### set_flashcard
* `id`, `mataKuliahId`, optional `babId`, `title`
* `version`, `status`, `generationHash`
* `creatorId`, optional `curatorId`, `publishedAt`, `createdAt`, `updatedAt`

### flashcard
* `id`, `setFlashcardId`, `front`, `back`, optional `explanation`
* `version`, `status`, `generationHash`, `createdAt`, `updatedAt`

### flashcard_ide
* `id`, `flashcardId`, `ideId`, `weight` (default 1)
* Atomic cards reference exactly one Idea.

### kemajuan_flashcard_murid
Per-murid canonical scheduling state (SM-2 fields).
* `id`, `penggunaId`, `flashcardId`
* `dueAt`, `intervalDays` (default 0), `easeFactor` (default 2.5), `repetitions`, `lapses`
* `lastReviewedAt`, `status` (default `active`), `createdAt`, `updatedAt`

### review_flashcard
Append-only canonical review history.
* `id`, `kemajuanFlashcardMuridId`, `grade`
* Optional `responseMs`, plus `previousDueAt`, `nextDueAt`, `reviewedAt`

Published Product Bundle article, material, question, solution, and flashcard records are required by the Product contract layer to reference at least one published Idea. Manual, Markdown, and MCP Bank Soal authoring may store a canonical question with zero `soal_ide` rows. When question links are present, `soal_ide.weight` has a database range check and the per-question sum is validated within `0.000001` by the authoring service.

Manual and Markdown question authoring uses these canonical tables first. `ai_question_bank` remains the compatibility projection for the current quiz readers; its row uses the canonical question ID and mirrors the lifecycle, prompt, options, answer keys, explanation, and generation hash.

### Assessment tables

### blueprint_asesmen
* `id`, `mataKuliahId`, `title`, `assessmentType`
* Optional `blueprint` (dimension allocation JSON)
* `version`, `status`, `generationHash`
* `creatorId`, optional `curatorId`, `createdAt`, `updatedAt`

### asesmen
* `id`, `blueprintAsesmenId`, `mataKuliahId`, `title`, `assessmentType`
* `version`, `status`, `generationHash`
* `creatorId`, optional `curatorId`, `publishedAt`, `createdAt`, `updatedAt`

### cakupan_asesmen
* `id`, `asesmenId`, `babId`, `orderIndex`, `createdAt`
* Quiz scope is exactly one row; tryout scope has one or more.

### item_asesmen
* `id`, `asesmenId`, `soalId`, `orderIndex`
* Immutable snapshots: optional `renderedQuestionSnapshot`, required `optionOrderSnapshot`, optional `gradingPolicySnapshot`, plus `contentVersion` and `generationHash`.
* `createdAt`

### percobaan_asesmen
Per-murid attempt record with the same immutable snapshot fields.
* `id`, `asesmenId`, `penggunaId`, `status` (default `in_progress`)
* `renderedQuestionSnapshot`, `optionOrderSnapshot`, `gradingPolicySnapshot`, `contentVersion`
* `startedAt`, optional `submittedAt`, `createdAt`

### jawaban_murid
Per-item answer with grading state.
* `id`, `percobaanAsesmenId`, `itemAsesmenId`
* Snapshots: optional `renderedQuestionSnapshot`, required `optionOrderSnapshot`, optional `responseSnapshot` and `gradingPolicySnapshot`, `contentVersion`.
* Optional `score`; `status` default `ungraded`; `answeredAt`.
* Manual review fields: optional `reviewerId`, `reviewNotes`, and `reviewedAt`; `reviewRevision` defaults to zero and supports optimistic concurrency.

Quiz and tryout cardinality is enforced by the assessment contract: a quiz has exactly one chapter and a tryout has at least one chapter. Foreign keys and unique indexes protect assessment item and answer membership.

### Evidence and mastery tables

### bukti_ide_jawaban
Answer-derived per-Idea evidence.
* `id`, `jawabanMuridId`, `ideId`
* `scoreContribution`, `weight`, `confidence`, `evidenceSource`, `rubricVersion`, `derivationStatus`
* `ambiguous` (default false) and `affectsMastery` (default false); ambiguous evidence cannot affect mastery.

### bukti_pembelajaran
General learning evidence with a unique idempotency key across source, Idea, and rubric.
* `id`, `penggunaId`, `ideId`
* `evidenceSource`, `sourceId`, `scoreContribution`, `confidence`, `rubricVersion`, `derivationStatus`
* `ambiguous` (default false), `affectsMastery` (default false)
* `occurredAt`, `createdAt`

### pemahaman_ide
Current per-(murid, Idea) mastery state; score and confidence are separate 0-100 integers.
* `id`, `penggunaId`, `ideId`
* `skor`, `keyakinan`, `evidenceCount` (default 0), `version`
* `algorithmVersion` (default `per-idea.v1`) and `inputWatermark` make every stored state replayable.
* `createdAt`, `updatedAt`

### perubahan_pemahaman
Append-only mastery transition history.
* `id`, `pemahamanIdeId`, optional `evidenceId`
* `previousScore`, `nextScore`, `previousConfidence`, `nextConfidence`, `reason`
* `evidenceIds`: JSON list of the complete contributing evidence IDs (default empty).
* `algorithmVersion` (default `per-idea.v1`), `inputWatermark`, `createdAt`

### rekomendasi_flashcard
Deterministic due recommendations derived from mastery state.
* `id`, `penggunaId`, `flashcardId`, optional `ideId`
* `dueAt`, `reason`, `status` (default `pending`), `createdAt`
* Cards for Ideas with mastery score 80 or higher are suppressed.

### Protected ITB references and benchmarks

### soal_itb_referensi
Protected ITB question snapshot bound to its published `soal` row.
* `id`, optional `soalId`: The single source reference link to the published question.
* `sourceLabel`: Exact source event label that must match the bundle's `itbSource.eventName`.
* `authoringVisibility`: `allowed` or `holdout` (database check). Holdout rows are excluded from runtime indexing and external authoring projections.
* Optional `contentSnapshot`, plus `checksum`, `version`, `createdAt`.

### benchmark_soal
Versioned benchmark snapshots with unique checksums.
* `id`, optional `soalItbReferensiId`
* `datasetKey`, `authoringVisibility` (`allowed` | `holdout`)
* JSON `questionSnapshot` and `answerSnapshot`
* `version` (positive, database check), unique `checksum`, `status` (`active` | `retired`), `createdAt`.

### Zyra personalization tables

AI Plan 008 adds three additive tables through migration `0067_zyra_continuation.sql`:

* `zyra_learning_events`: course-scoped, bounded learner evidence with event kind, source type, outcome, latency bucket, hint level, representation, weight, and retention expiry. It may reference an Idea but never stores raw conversation content.
* `zyra_learner_profiles`: one inferred adaptation profile per murid and course, including version, inferred presentation fields, confidence, evidence count, expiry, reset watermark, and reason codes.
* `zyra_learner_preferences`: one explicit presentation preference record per murid and course, kept separate from inferred profile fields.

The migration adds foreign keys and query indexes only. Existing attempt, learning-event, mastery, recommendation, and assessment tables are unchanged. Personalization reads are deterministic and do not replace the authoritative mastery or assessment systems.

### zyra_learning_events
Course-scoped bounded learner evidence; never stores raw conversation content.
* `id`, `studentId`, `courseId`, optional `ideaId`
* `eventKind`, `sourceType`, optional `evidenceRef` and `outcome`
* Optional `correctness`; `responseLatencyBucket`, `hintLevel`, `representation` default `unknown`
* `weight` (default 1), `createdAt`, `expiresAt`
* Events expire; the aggregator requires at least three recent events before inference.

### zyra_learner_profiles
One inferred adaptation profile per murid and course.
* `id`, `studentId`, `courseId`, `profileVersion` (default `zyra-personalization-v1`)
* Inferred fields each defaulting to `unknown`: `inferredPace`, `inferredRepresentation`, `supportIntensity`, `explanationLength`, `checkpointType`
* `confidence` (default 0), `evidenceCount` (default 0), `reasonCodes`
* `lastEvidenceAt`, `expiresAt`, `resetAt`, `createdAt`, `updatedAt`

### zyra_learner_preferences
One explicit presentation preference record per murid and course, kept separate from inferred fields.
* `id`, `studentId`, `courseId`
* Optional `pace`, `representation`, `explanationLength`, `checkpointType`
* `createdAt`, `updatedAt`

Ambiguous evidence is stored with explicit status and the schema check prevents it from being marked as mastery-affecting. Plan 011 recomputes only the additive per-Idea tables; no legacy mastery, learning-event, answer, or review row is rewritten.

### Bundle and audit tables

### impor_bundle
Checksum-identified import record; public Product status is `draft`, `published`, or `withdrawn` (legacy Idea workflow statuses remain readable). Idea draft deletion uses the transient `discarding` status to block publication while artifact cleanup runs and to preserve a retryable record if storage deletion fails.
* `id`, `bundleId`, `checksum`, `bundleType`
* Optional legacy `courseId`, required `sourceUriOrKey`
* `version`, `status` (default `received`), optional JSON `validationReport`
* `requestedBy`, `createdAt`, `updatedAt`
* On the isolated PostgreSQL branch, internal `insertionOrder` is a generated bigint identity. Source-import selection uses it to break equal timestamp ties; public import records omit it. Migrated values preserve SQLite insertion order.
* A matching bundle ID and checksum is idempotent; a reused ID with a different checksum is a conflict.

### item_impor_bundle
Entity inventory for one import.
* `id`, `imporBundleId`, `entityType`, `entityId`, `entityVersion`, `entityHash`
* `status` (default `pending`), optional `errorMessage`, `createdAt`

### review_bundle
Internal review evidence; one immutable decision per reviewer, never a separate public lifecycle state.
* `id`, `imporBundleId`, `reviewerId`
* `status` (default `pending`), optional `notes`, optional `reviewedAt`, `createdAt`

### review_item_bundle
Persistent Product Bundle item review state for one reviewer. This metadata stays outside the Product Bundle ZIP.
* `id`, `imporBundleId`, `reviewerId`, optional legacy `productId` and `blockId`, `targetType`, `targetId`
* `status` is `pending`, `approved`, or `changes_requested`; optional `notes`, `createdAt`, `updatedAt`
* Unique target is import, reviewer, target type, and target ID.
* Import deletion cascades to item reviews. Reviewer deletion is restricted.
* Admin draft edit preserves unchanged section rows and resets changed section rows. A bundle decision makes the same reviewer's rows immutable at the service boundary.

### review_pedagogi_bundle
Revision-bound Product Bundle pedagogic review evidence stored outside the authored ZIP.
* `id`, `imporBundleId`, `reviewerId`, `contentFingerprint`, `policyVersion`
* `status` is `pending`, `approved`, `rejected`, or `changes_requested`; `rubric` stores all eight criteria, while `exceptions` and optional `notes` preserve the decision rationale.
* The unique decision identity is import, reviewer, content fingerprint, and policy version. Publication accepts only the current approving publisher's matching approval.

### bukti_pdf_bundle
Revision-bound Diktat PDF renderer evidence stored outside the authored ZIP.
* `id`, `imporBundleId`, `productId`, Article version and hash, Diktat hash, renderer version, and print profile.
* `status` is `pending`, `ready`, `failed`, or `stale`; ready rows require a protected `storageKey` and a verified `pageCount` from 1 to 4, while failed rows retain only a safe `failureCode`.
* One lineage row is selected by import, Diktat product, Diktat hash, and print profile. Newer unrelated or Article-owned rows cannot outrank current Diktat evidence.

### publikasi_bundle
Publication record created or refreshed at atomic publication.
* `id`, `imporBundleId`, `approvedReviewId`, `version`
* `publicationHash`, `status` (default `pending`)
* `publishedBy`, optional `publishedAt`, `createdAt`

Plan 006 uses these tables as a staged workflow. Uploads do not write canonical source or Idea rows. Publication updates staged item status and the approved bundle in one transaction with canonical source, chunk, Idea, provenance, relation, audit, and vector outbox writes.

Plan 008 reuses the same import, item, review, publication, audit, dependency, and vector outbox tables for Product Bundle V2. Migration `0081_numerous_gwen_stacy.sql` adds `review_item_bundle` as advisory staged review metadata with no backfill. Existing drafts therefore begin with every Article block effectively pending. Draft replacement rewrites the import inventory and R2 artifact and clears block review rows before publication. Publication inserts canonical article, diktat, question, solution, flashcard, and assessment blueprint rows after traceability and dependency checks pass. Withdrawal marks canonical rows inactive or retired according to their existing table contract and adds vector delete jobs. Question products are exclusively ITB examples and require `itbSource`, ITB curation, typed option IDs with deterministic correct markers, exactly one paired solution, and a HOT cognitive level for multi-Idea questions. Correct markers remain inside the private `soal.options_snapshot` grading representation and are redacted from runtime and vector content. Versions greater than one use versioned product IDs so prior rows remain queryable.

Migrations `0082_structured_article_expand.sql` and `0083_structured_article_review_targets.sql` add structured learning and Article tables, progress, generic review targets, and compatibility columns. V3 publication stores semantic rows and derived Markdown transactionally. V3 publication requires section approval from the same admin who approved the bundle.

Migrations `0087_curly_black_tom.sql` and `0088_talented_shinobi_shaw.sql` add Product Bundle pedagogic-review and PDF-evidence tables, then apply their lineage uniqueness, status, page-count, and Article-version constraints. They are additive to canonical product data; no existing Article or Diktat rows are rewritten.

Migration `0068_typical_warbird.sql` adds `origin`, `source_event_name`, and `source_reference_id` to both `soal` and `ai_question_bank`, with `zyx_original` as the non-null default and an origin plus event index on each table. Existing rows therefore remain Zyx originals without a data rewrite. Product publication validates ITB completeness before writing and creates the `ai_question_bank` compatibility projection. Product Bundle source and curation data are retained in the publication audit snapshot, while `soal_itb_referensi.soal_id` links the single source reference to its published question. Article to Diktat lineage is validated through bundle dependency rows and generation hashes. Live legacy quiz submissions use the existing `item_asesmen`, `jawaban_murid`, and `bukti_ide_jawaban` tables to append canonical evidence only after exact published-question and published-Idea checks pass.

Migration `0089_old_wendigo.sql` adds historical-reference provenance, source document metadata, quiz eligibility gates, and `question_reference_links`. It preserves the legacy Product Bundle V2 and ITB compatibility fields while adding Product Bundle V3 validation boundaries. The migration is generated from the current SQLite schema and must be applied only after the target database has the preceding journal and index state expected by Drizzle.

Migration `0085_melodic_korvac.sql` adds `student_quiz_attempts.grading_status` with `not_required` as the compatibility-safe default and an index by template and grading state. It also adds reviewer identity, notes, timestamp, and revision fields to `jawaban_murid` for tutor quiz review.

### Plan 005 migration tables

### legacy_backfill_exceptions
Zero-loss preservation ledger for a legacy row that has no exact additive representation.
* `id`, `runId`, `legacyTable`, `legacyId`
* `reasonCode`, `preservationPath`, optional `details`
* `blocksCutover` (default false), `sourceChecksum`, `createdAt`, `updatedAt`

### migration_runs
Resumable backfill run state used by the staging backfill engine.
* `id`, `planNumber`, `sourceCommit`, `schemaVersion`, `databaseFingerprint`
* `phase`, `status`
* `startedAt`, optional `completedAt`, optional `rowCountManifestHash`, optional `errorCode`

### migration_checkpoints
Bounded batch checkpoints inside one run.
* `id`, `runId`, `phase`, `checkpoint`, `status`
* Optional `manifestHash`, `rowCount`, `details`, `createdAt`

### peta_id_legacy
* `legacyTable`, `legacyId`, `targetTable`, `targetId`
* `mappingVersion`, `sourceChecksum`, `targetChecksum`, `runId`
* Legacy and target identity pairs are each unique.

Plan 005 populated the additive targets where the mapping was exact and recorded compatibility-only rows instead of inventing target data. Legacy source tables remain queryable during the expand phase. The no-read-switch rule remains in force until a later plan.

---

## 6. Assessment & Ingestion Domain

### assessmentSources
Existing rows remain available to compatibility readers. Admin create, re-ingest, archive, restore, and delete endpoints are retired; new source-backed questions enter through Product Bundle and canonical Bank Soal. Historical reference ingestion adds a course-scoped source record without requiring a chapter or Source Pack.

* `id`
* `courseId`
* `title`
* `origin`: Ingestion starting point (e.g. 'uploaded').
* `category`: Type of assessment document (e.g. 'uts', 'uas', 'kuis', 'tutorial').
* `assessmentType`: Historical assessment type such as `uts`, `uas`, `kuis`, or `tutorial`.
* `year`: Nullable academic calendar year of the assessment.
* `institution`, optional `academicYearLabel`, and optional `term`: Human-facing source identity fields.
* `canonicalCourseId`: Canonical course binding used by historical question authoring.
* `sourceDocumentId`, optional `solutionDocumentId`: Course material rows for the original question PDF and its solution PDF.
* `status`: `draft`, `in_review`, `published`, or `retired`.
* `semester`: Academic semester number of the assessment.
* `sourceMarkdown`: Fully uploaded raw text content of the assessment paper.
* `sourceHash`: Hash of the raw markdown text for change and duplicate tracking.
* `version`: Data schema version.
* `parserVersion`: Extractor engine version used to ingest the source.
* `ingestionStatus`: Ingestion job queue state ('pending', 'processing', 'completed', 'failed').
* `ingestionError`: Error details if parsing failed.
* `ingestionStartedAt`: Execution start time.
* `ingestionCompletedAt`: Completion time.
* `originalFilename`: Raw name of the source PDF.
* `uploadthingKey`: Upload key of the file in storage.
* `uploadedByUserId`: Teacher or admin user who uploaded the document.
* `deletedAt`
* `deletedByUserId`
* `createdAt`
* `updatedAt`

### assessmentSourceChapters
* `id`
* `assessmentSourceId`
* `chapterId`

### quiz_ai_insights
* `id`: Primary key (`qai_...`).
* `templateId`: FK to `quizTemplates.id` (nullable).
* `examId`: FK to `exams.id` (nullable).
* `sampleSize`: Number of completed student attempts analyzed.
* `insights`: JSON object containing executive summary, misconceptions, teaching recommendations, hardest questions diagnosis, easiest questions, and actionable next steps.
* `summary`: Text overview summary.
* `generatedById`: FK to `user.id` (admin/tutor who ran AI analysis).
* `createdAt`
* `updatedAt`

### assessmentObjects
* `id`
* `sourceId`
* `questionOrder`: Rendering sequence position inside the original assessment paper.
* `sourceQuestionNumber`: Human-facing question label from the paper (e.g. "1a", "2").
* `questionType`: Category format ('multiple_choice', 'essay').
* `difficulty`: Difficulty tier metric ranging from 1 to 5.
* `applicationLevel`: Cognitive level matching pedagogical standards.
* `pattern`: Identified question pattern or style label.
* `reasoningType`: Mode of thinking needed (e.g. conceptual, procedural).
* `estimatedSteps`: Estimate count of reasoning steps.
* `questionMarkdown`: The question statement text.
* `answerMarkdown`: The worked solution or ideal answer text.
* `options`: Answer choices array stored as JSON.
* `canonicalQuestionHash`: Normalized content hash used to detect duplicate questions across history.
* `createdAt`
* `updatedAt`

### assessmentObjectConcepts
* `id`
* `assessmentObjectId`
* `conceptId`

### assessmentObjectKos
* `id`
* `assessmentObjectId`
* `koId`

### assessmentProfiles
* `id`
* `courseId`
* `difficultyDistribution`: Normal distribution of questions difficulty stored as a JSON object.
* `commonPatterns`: Frequencies of question styles stored as a JSON array.
* `topContexts`: Frequently tested topics stored as a JSON array.
* `createdAt`
* `updatedAt`

### coursePolicies
* `id`
* `courseId`
* `maxApplicationLevel`: Upper limit on question cognitive levels allowed.
* `maxEstimatedSteps`: Upper limit on question duration complexity.
* `forbiddenContexts`: List of terms or topics excluded from quiz generation.
* `allowedPatterns`: Allowed question patterns whitelist.
* `createdAt`
* `updatedAt`

---

## 7. Published Assets & Materials

### websiteMaterials
Existing rows remain available to student and compatibility readers. The standalone Admin material CRUD is retired; new Articles are published through Product Bundle.

* `id`
* `courseId`
* `chapterId`
* `sourceMtdId`
* `slug`: Web routing identifier path.
* `canonicalMarkdown`: Cleaned textbook contents.
* `structuredContent`: Parsed HTML Abstract Syntax Tree stored as JSON.
* `termIndex`: Index of key phrases and vocabulary map.
* `generationHash`: Verification checksum matching current source state.
* `isStale`: Flag indicating if source has updated and requires a rebuild.
* `createdAt`
* `updatedAt`

### websiteMaterialVersions
* `id`
* `materialId`
* `authorId`
* `version`: Version incremental number.
* `changeSummary`: Text detailing edits made in this revision.
* `createdAt`

### flashcardSets
* `id`
* `courseId`
* `chapterId`
* `sourceMtdId`
* `title`
* `isStale`: Flag indicating if cards require regeneration.
* `createdAt`
* `updatedAt`

### flashcards
* `id`
* `setId`
* `koId`
* `front`: Front face question or prompt.
* `back`: Back face answer or definition.
* `explanation`: Explanatory details supporting the answer.
* `createdAt`
* `updatedAt`

### diktats
Existing rows remain available to compatibility readers. The standalone Admin compiler CRUD is retired; new Diktat records are published through Product Bundle.

* `id`
* `courseId`
* `sourceMtdId`
* `fileUrl`: Public URL path pointing to generated PDF study guides.
* `version`: Version tracking counter.
* `isStale`: Re-evaluation flag matching source document state.
* `createdAt`
* `updatedAt`

### courseMaterials
* `id`
* `courseId`
* `title`
* `type`: Upload category, Level 1: 'materi', 'soal', 'pembahasan_soal' (also supports legacy 'materi_kelas', 'contoh_soal').
* `subcategory`: Level 2 subcategory ('ppt_dosen', 'ebook', 'catatan', 'kuis', 'kbf', 'tutorial', 'modul', 'uts', 'uas', 'lainnya').
* `year`: Optional academic year (integer).
* `fileUrl`: Public URL or storage key pointing to uploaded asset.
* `checksum`: Optional SHA-256 hex of the stored file, used by the admin batch upload duplicate check. Null for rows created before batch upload.
* `chapterIds`: Associated chapter list stored as a JSON array.
* `thumbnailUrl`: Page 1 thumbnail preview image path.
* `createdAt`
* `updatedAt`

### studentFlashcardProgress
SM-2 spaced-repetition scheduling state per (student, flashcard).
* `id`
* `studentId`, `flashcardId`: Unique pair per card per student.
* `easeFactor` (default 2.5), `intervalDays`, `repetitions`, `lapses`
* `dueDate`: Next scheduled review timestamp.
* `lastReviewedAt`
* `createdAt`, `updatedAt`

### flashcardReviews
Append-only review log feeding SM-2 updates and analytics.
* `id`
* `studentId`, `flashcardId`
* `grade`: Recall grade 1 to 4 ('Again', 'Hard', 'Good', 'Easy').
* `responseTimeMs`
* `reviewedAt`

### studentMaterialProgress
Reading progress for interactive website materials.
* `id`
* `studentId`, `materialId`: FK to `websiteMaterials.id`.
* `completionPercent`: 0-100.
* `lastPosition`: JSON pointer into the content (`type: 'pdf' | 'article'`, optional page or section). Legacy `lastSectionId` remains but is deprecated.
* `timeSpentSeconds`: Accumulated reading time.
* `lastOpenedAt`
* `createdAt`, `updatedAt`

---

## 8. Quiz System

### quizTemplates
* `id`
* `courseId`
* `title`
* `category`: Quiz type classification ('daily', 'weekly', 'chapter', 'premium', 'simulation').
* `visibility`: 'free' or 'paid'.
* `status`: Authoring state, 'draft' or 'published'.
* `timeLimitSeconds`: Countdown duration allowed for the quiz in seconds. This is the authoritative session cap; submissions arriving more than 120 seconds after expiry are rejected.
* `maxAttempts`: Optional attempt cap per student.
* `selectionRules`: Selection parameter guidelines for picking questions stored as JSON. Timer fields inside this JSON: `perQuestionTimerEnabled`, `perQuestionTimers` (per-question overrides in seconds), and `defaultQuestionTimerSeconds`. When the per-question timer is enabled together with `timeLimitSeconds`, the sum of per-question allowances must equal the total limit (enforced at authoring time and by the template APIs). Per-question timers pace individual questions only; they never shorten a session below the total limit.
* `openAt` / `closeAt`: Optional visibility window timestamps.
* `manualStatus`: Tutor-controlled state, 'open', 'closed', or 'scheduled'.
* `showDiscussion`: Whether the discussion panel is shown for this quiz.
* `spreadsheetId` / `spreadsheetUrl`: Linked Google Spreadsheet export target.
* `createdAt`
* `updatedAt`

This table is a compatibility projection of canonical `asesmen` and `blueprint_asesmen`; new quizzes write to the canonical assessment tables first and project here.

### studentQuizAttempts
* `id`
* `studentId`
* `templateId`
* `score`: Quiz performance grade.
* `timeSpent`: Duration consumed in seconds.
* `completed`: Boolean indicating if quiz attempt is finished.
* `questionsSnapshot`: Deep copy capture of questions served.
* `answersSnapshot`: Record list of student answers.
* `masteryBefore`: Concept mastery values snapshot taken before starting.
* `feedbackPayload`: AI generated summary feedback.
* `createdAt`
* `completedAt`

### attemptFeedback
* `id`
* `attemptId`
* `questionIndex`: Sequence index of the target question.
* `payload`: Structured AI analysis feedback data stored as JSON.

### studentQuizAnalytics
Per-attempt detailed deterministic facts plus AI pedagogical diagnosis for the analytics and insights portals.
* `id`
* `attemptId`: Unique FK to `studentQuizAttempts.id`.
* `studentId`, `templateId`, `courseId`
* `status`: 'processing', 'completed', or 'failed'.
* `computedMetrics`: Deterministic metrics JSON (item difficulty, distractor selection, timing).
* `aiDiagnosis`: Optional AI pedagogical diagnosis JSON.
* `errorMessage`: Failure details when status is 'failed'.
* `createdAt`, `updatedAt`

### liveQuizSessions
* `id`
* `courseId`
* `tutorId`
* `templateId`
* `code`: Unique session join code shown to students.
* `state`: Live lobby session stage ('lobby', 'question', 'reveal', 'ended').
* `questionsSnapshot`: Fixed set of questions compiled for session.
* `participantCount`: Count of students active in session.
* `createdAt`
* `endedAt`
* `deliveryStatus`: Downstream delivery lifecycle state ('pending', 'processing', 'delivered', 'failed', default 'pending').
* `deliveryClaimedAt`: Timestamp when active processing lease was claimed, used for 30-second stale claim recovery.
* `deliveryClaimToken`: Unique fencing token generated upon lease acquisition for Compare-And-Set concurrency control and conditional delivery finalization.
* `deliveredAt`: Timestamp when downstream learning events and mastery recomputes were successfully dispatched.

### liveQuizResults
* `id`
* `sessionId`
* `studentId`
* `courseId`
* `score`: Current game score.
* `rank`: Student placement tier on session end.
* `answersSnapshot`: Student choices record.
* `completedAt`

---

## 9. Mastery, Analytics & AI Logs

### learningEvents
* `id`
* `studentId`
* `courseId`
* `conceptName`: Target concept name slug.
* `koId`
* `eventType`: Trigger activity classification ('quiz_answer', 'flashcard_review', 'material_completed', 'tutor_question').
* `correctness`: Standard score grade ranging between 0 and 1.
* `weight`: Priority modifier scoring impact.
* `createdAt`

### studentConceptMastery
* `id`
* `studentId`
* `courseId`
* `conceptName`: Target concept name slug.
* `masteryScore`: Student computed concept capability percentage.
* `confidence`: Statistical confidence value.
* `evidenceCount`: Evidence trace count used in mastery evaluation.
* `trend`: Capability trajectory status indicator ('improving', 'stable', 'declining').
* `lastEvidenceAt`: Last active learning trace timestamp.
* `updatedAt`

### studentConceptMasteryHistory
* `id`
* `studentId`
* `courseId`
* `conceptName`
* `masteryScore`
* `confidence`
* `snapshotDate`: String identifier date (yyyy-mm-dd) of historical data record.

### studentStreaks
* `studentId`
* `currentStreak`: Active consecutive daily study count.
* `longestStreak`: Record maximum daily streak achieved.
* `lastActiveDate`: Target date (yyyy-mm-dd) of last learning activity.

### dailyRecommendations
* `id`
* `studentId`
* `date`: Recommendation target date (yyyy-mm-dd).
* `payload`: Structure of suggested actions and resources stored as JSON.
* `completedItems`: Done task identifiers list.
* `generatedAt`

### tutorSessionSummaries
* `id`
* `studentId`
* `courseId`
* `askedConcepts`: Track list of concepts discussed in the chat stored as JSON.
* `questionCount`: Total messages exchanged counter.
* `lastSessionAt`

### tutorChatMessages
* `id`
* `studentId`
* `courseId`
* `role`: Author role identifier ('student', 'ai').
* `content`: Message payload text.
* `sources`: Reference chunks citation list.
* `createdAt`

### interventions
* `id`
* `studentId`
* `courseId`
* `conceptName`
* `reason`: Explanatory trigger tag for remedial intervention.
* `status`: Current state of remedial actions ('active', 'dismissed', 'resolved').
* `payload`: Suggested extra exercises or readings stored as JSON.
* `createdAt`
* `resolvedAt`

### studyPaths
* `id`
* `studentId`
* `courseId`
* `pathJson`: Sequence route of chapter milestones stored as JSON.
* `computedAt`

### courseAnalyticsSnapshots
* `id`
* `courseId`
* `date`: Pre-calculated metrics date target (yyyy-mm-dd).
* `payload`: Detailed pre-computed statistics bundle stored as JSON.
* `createdAt`

### weeklyReflections
* `id`
* `studentId`
* `weekStart`: Calendar week starting date string (Monday, yyyy-mm-dd).
* `payload`: Aggregated learning accomplishments and self-progress reports.
* `createdAt`

### studentChapterProgress
* `id`
* `studentId`
* `courseId`
* `chapterId`
* `unlocked`: Boolean indicating if the chapter is accessible.
* `completed`: Boolean indicating if the chapter has been finished.
* `completedAt`
* `createdAt`
* `updatedAt`

### studentChapterMastery
Per-chapter mastery rollup derived from per-Idea and per-concept evidence.
* `id`
* `studentId`, `courseId`, `chapterId`
* `masteryScore`, `confidence`, `evidenceCount`
* `trend`: 'improving', 'stable', 'declining', or null when unknown.
* `lastEvidenceAt`
* `createdAt`, `updatedAt`

### chatSessions
Tutor chat conversation grouping per (student, course).
* `id`
* `studentId`, `courseId`
* `title`: Conversation title.
* `startedAt`, `lastMessageAt`
* `createdAt`, `updatedAt`

### chatMessageSources
Retrieved-source citations attached to a tutor chat message.
* `id`
* `messageId`: FK to `tutorChatMessages.id`.
* `sourceType`: 'knowledge_object', 'website_material', 'flashcard', 'concept', or 'assessment_question'.
* `sourceId`: Referenced row identifier.
* `relevanceScore` (default 1.0)
* `createdAt`

### masteryRecomputeQueue
* `id`
* `studentId`
* `courseId`
* `eventType`: Trigger event that requested recompute.
* `status`: Queue state ('pending', 'processing', 'completed', 'failed').
* `error`: Error details if processing failed.
* `retries`: Retry attempt counter.
* `createdAt`
* `updatedAt`

### conceptGraphEdges
* `id`
* `courseId`
* `sourceConcept`: Starting concept slug.
* `targetConcept`: Destination concept slug.
* `type`: Dependency relation ('prerequisite', 'related').

---

## 10. Learning Outcomes (Accreditation)

### learningOutcomes
* `id`
* `courseId`
* `code`: Outcome code (e.g. CPL-01, CPMK-01.1).
* `name`: Outcome description text.
* `parentId`: Reference to parent outcome for hierarchy (CPL → CPMK → Sub-CPMK).
* `level`: Hierarchy level indicator.
* `createdAt`
* `updatedAt`

### learningOutcomeConcepts
* `id`
* `outcomeId`
* `conceptId`

---

## 11. Career Paths

### careerPathTemplates
* `id`
* `title`
* `description`
* `icon`: Icon identifier for display.
* `pathJson`: Ordered list of concept milestones stored as JSON.
* `createdAt`
* `updatedAt`

### careerPathConcepts
* `id`
* `careerPathId`
* `conceptId`
* `order`: Sequence position in the career path.

---

## 12. PKA Campaign

### pkaSimulationStages
* `id`
* `subject`: Subject name (matematika, fisika, kimia).
* `name`: Stage display name.
* `quizTemplateId`: Reference to quiz template for this stage.
* `passingScore`: Minimum score to unlock next stage.
* `order`: Stage sequence index.
* `isActive`: Boolean toggle for stage visibility.
* `createdAt`
* `updatedAt`

### pkaStageProgress
* `id`
* `studentId`
* `stageId`
* `status`: Stage completion state ('locked', 'available', 'passed', 'failed').
* `quizAttemptId`: Reference to the student's quiz attempt.
* `createdAt`
* `updatedAt`

### pkaAnnouncements
* `id`
* `title`
* `body`
* `pinned`: Boolean indicating if announcement should be highlighted.
* `publishedAt`
* `createdAt`
* `updatedAt`

### pkaAnnouncementReads
Per-user read receipts for PKA announcements; composite primary key.
* (`announcementId`, `userId`): Composite primary key, both cascading FKs.
* `readAt`

### pkaSchedules
* `id`
* `title`
* `sessionAt`: Timestamp of the live session.
* `meetLink`: Optional Google Meet URL.
* `createdBy`: Admin user who created the schedule.
* `sentAt`: Broadcast completion timestamp (email/push).
* `recipientCount`: Number of recipients the broadcast reached.
* `createdAt`

### pkaRegistrations
* `id`
* `userId`
* `fullName`
* `phone`
* `origin`: School or university of origin.
* `status`: Registration state ('pending', 'approved', 'rejected').
* `createdAt`
* `updatedAt`

---

## 13. Content Quality

### contentQualityFlags
* `id`
* `courseId`
* `targetType`: Flagged entity type ('question', 'flashcard', 'ko').
* `targetId`: Reference to the flagged entity.
* `flagType`: Quality issue category ('too_easy', 'too_hard', 'dead_distractor', 'ambiguous').
* `severity`: Impact level ('low', 'medium', 'high').
* `details`: Explanatory text stored as JSON.
* `resolved`: Boolean indicating if the flag has been addressed.
* `createdAt`
* `updatedAt`

---

## 14. Blog & Short Links

### blogArticles
* `id`
* `slug`: URL-friendly unique identifier.
* `title`
* `excerpt`: Short preview text.
* `content`: Full article markdown content.
* `category`: Article classification ('tips_kuliah', 'pojok_kampus', 'fakta_seru', 'kegiatan_zyx').
* `coverImage`: Featured image URL.
* `authorId`: Reference to the author user.
* `published`: Boolean indicating if the article is publicly visible.
* `publishedAt`
* `createdAt`
* `updatedAt`

### shortLink
* `id`
* `slug`: Short URL path component.
* `url`: Target destination URL.
* `title`: Display title of the short link.
* `clicks`: Visit counter.
* `createdAt`

### pageAnalytics
* `id`
* `path`: Page route path.
* `title`: Page display title.
* `views`: View count.
* `uniqueVisitors`: Distinct visitor count.
* `snapshotDate`: Date of the analytics snapshot (yyyy-mm-dd).
* `createdAt`

---

## 15. AI Generation System

### aiGenerationJobs
* `id`
* `tutorId`
* `courseId`
* `status`: Job worker state ('pending', 'processing', 'completed', 'failed').
* `error`: Error payload details.
* `promptType`: Category of generation task.
* `promptPayload`: Payload parameters stored as JSON.
* `responsePayload`: Gemini generated answer response payload.
* `promptTokens`: Token count used in prompt.
* `candidatesTokens`: Token count generated in candidates.
* `createdAt`
* `updatedAt`

### questionGenerationRuns
* `id`
* `courseId`
* `blueprintVersion`: Version tag of the blueprint engine used (e.g. '2.0').
* `promptVersion`: Version tag of prompt contract used (e.g. '2.0').
* `sourceVersion`: Version identifier of the source document/MTD.
* `shuffleSeed`: Seed integer used for deterministic application option shuffle.
* `validatorVersion`: Version tag of validator quality gate used (e.g. '2.0').
* `slotCount`: Total slots requested in the generation batch.
* `acceptedCount`: Total valid questions accepted and persisted.
* `status`: Batch execution status ('completed', 'failed', 'partial', 'processing').
* `createdAt`

### aiQuestionBank
* `id`
* `courseId`
* `origin`: `zyx_original`, `historical_reference`, or `itb_example`. Existing rows default to `zyx_original`.
* `sourceEventName`: Required by the application contract for `itb_example`; null for Zyx originals.
* `sourceReferenceId`: Allowed ITB reference ID for `itb_example`; null for Zyx originals.
* `assessmentSourceId`, optional source question number, part, page, and locator for historical references.
* `answerProvenance` and `solutionProvenance`: Source-trace enum for historical answers and solutions.
* `quizEligible`: Historical rows default to false and are excluded from runtime quiz selectors until explicitly eligible.
* `knowledgeObjectId`
* `sourceMtdId`
* `sourceSectionId`
* `generationRunId`: Foreign key reference to `questionGenerationRuns.id`.
* `styledAfterAssessmentObjectId`: Optional reference link to an original exam question style source.
* `pattern`: Pedagogical classification pattern.
* `reasoningType`: Mode of thinking needed.
* `applicationLevel`: Cognitive level matching pedagogical standards.
* `estimatedSteps`: Estimate count of reasoning steps.
* `questionType`: Category format ('multiple_choice', 'multiple_choices', 'short_answer', 'essay').
* `prompt`: The question prompt statement.
* `options`: Shuffled array of option text strings (empty for short_answer and essay).
* `correctIndices`: Array of 0-based correct option display indices.
* `acceptableAnswers`: JSON array of acceptable answer text variations for `short_answer` questions.
* `distractorMap`: Legacy JSON array mapping non-correct option indices to misconception KOs.
* `explanation`: Explanatory details or essay grading rubric.
* `reviewStatus`: Question lifecycle status ('generated', 'reviewed', 'published', 'flagged', 'retired').
* `qualityScore`: Real number score (null for unverified new questions until Plan 011 acceptance test).
* `generationHash`: Validation checksum matching current settings state.
* `isStale`: Re-evaluation flag matching source document state.
* `createdAt`

### distractorProvenance
* `id`
* `questionId`: Master question ID referencing `aiQuestionBank.id`.
* `optionIndex`: Final 0-based option display index after shuffle.
* `stableOptionId`: Stable option ID (e.g., 'opt_0', 'opt_1') surviving position shuffle.
* `targetedMisconception`: Targeted misconception or error family ('calc_error', 'unit_error', 'vocab_swap', 'misconception', 'none', 'other').
* `misconceptionKoId`: Optional reference to a specific misconception Knowledge Object ID.
* `supportingSourceIds`: JSON array of supporting KO or source document IDs.
* `mappingMethod`: Method used for distractor mapping ('exact_ko', 'heuristic_pattern', 'lexical_overlap', 'embedding_similarity', 'manual_override', 'unknown').
* `score`: Numerical similarity or confidence score.
* `methodVersion`: Version tag of the distractor provenance engine (e.g., '2.0').
* `uncertaintyState`: Categorical state ('confident', 'ambiguous', 'unknown'). Ambiguous scores are persisted as unknown.
* `createdAt`

### questionOptionStats
* `id`
* `questionId`: Master question ID.
* `optionText`: Text value of the answer choice option.
* `selections`: Cumulative pick counter.
* `createdAt`
* `updatedAt`

### aiUsageEvents
* `id`
* `userId`
* `feature`: Application module trigger (e.g. 'tutor', 'flashcards', 'quiz').
* `model`: Identifier of target model used (e.g. 'gemini-2.5-flash').
* `tokens`: Evaluated token count count.
* `requestType`: Task type signature (e.g. 'explain_concept', 'analyze_mistake').
* `createdAt`

### aiAllowanceLeases
Application-side lease ledger for the Zyra allowance system. One lease per provider-backed request, reserved before dispatch and resolved to exactly one terminal state.
* `id`
* `idempotencyKey`: Unique key; committed leases derive a compatibility usage event from it.
* `userId`: FK to `pengguna.id`.
* `peran`: Resolved canonical role ('admin', 'tutor', 'murid').
* `feature`, `requestType`, `model`
* `appDay`: Jakarta calendar day string used for daily ceilings.
* `units`, `interactionUnits`: Provider turns and total interaction units (counted separately).
* `premium`: Boolean premium classification.
* `status`: 'reserved', 'dispatched', 'committed', or 'refunded'.
* `controlPlaneLeaseId`: Linked staging control-plane lease when the router path is used.
* `inputTokens`, `outputTokens`
* `runId`: Optional staging run correlation.
* `createdAt`, `dispatchedAt`, `resolvedAt`, `expiresAt`

### aiExtractionFailures
* `id`
* `courseId`
* `chapterId`
* `step`: Process phase where extraction failed ('extraction', 'canonicalization', 'validation').
* `rawOutput`: Unparsed raw text output from model.
* `errorMessage`: Parsed error statement details.
* `createdAt`

---

## 16. Transactional Queue & System Operations

### vectorSyncQueue
* `id`
* `courseId`
* `koId`: Optional Knowledge Object reference (set null on KO delete).
* `action`: Mutation command ('upsert', 'delete').
* `namespace`: Canonical Vectorize namespace routing pointer (default 'learning').
* `payload`: Provider-neutral vector payload JSON (required).
* `status`: Sync state ('pending', 'processing', 'completed', 'failed').
* `attempts`: Re-attempt count.
* `lastError`: Log message if the last sync attempt failed.
* `createdAt`
* `updatedAt`

### userPushTokens
* `id`
* `userId`
* `token`: Device unique token pointer for Firebase Cloud Messaging.
* `device`: Human readable user-agent client information.
* `createdAt`
* `updatedAt`

### notifications
* `id`
* `userId`
* `title`
* `body`
* `type`: Categorization category ('quiz_published', 'flashcard_reminder', 'tutor_reminder', 'payment_success', 'admin_broadcast', 'announcement').
* `read`: Toggle indicator showing if notification has been read.
* `metadata`: Dynamic data attributes dictionary payload (JSON).
* `attempted`: FCM token send attempts for this user's devices.
* `succeeded`: Successful FCM deliveries for this user.
* `failedCount`: Failed FCM deliveries for this user.
* `sentAt`: Timestamp of the push attempt; null when the user had no registered device.
* `createdAt`

---

## 17. Deprecated Legacy Tables (Pre-v4)

### progress
* `id`
* `userId`
* `materialId`: Reference pointing to legacy material format database item.
* `completed`: Status checking if material was finished.
* `lastPosition`: Reader layout index offset.
* `createdAt`
* `updatedAt`

## 21. Content Workflow and Mutation Audit

### alur_konten
* `id`: Unique entity and version workflow key.
* `entityType`, `entityId`, `courseId`: Canonical content identity and course scope.
* `version`: Immutable content version number.
* `state`: Upload, validation, staging, tutor review, admin review, approval, publication, supersession, or withdrawal state.
* `contentHash`: Hash of the reviewed canonical content.
* `assignedTutorId`: Optional course-scoped tutor assignment.
* `lastRequestId`, `lastReason`: Last transition correlation and human reason.
* `createdAt`, `updatedAt`

The table is additive and does not replace historical content tables. Transitions are enforced by `lib/workflow/content-workflow.ts` and every mutation writes a structured `audit_mutasi` envelope.

### audit_mutasi
Structured mutation-audit envelope written by every guarded canonical transition.
* `id`
* Optional `actorId`: Acting `pengguna` reference.
* `entityType`, `entityId`, `action`: What changed and how.
* Optional `beforeSnapshot` / `afterSnapshot`: JSON state envelopes with recursive secret redaction and truncation.
* Optional `correlationId`: Cross-table correlation for one logical operation (bundle run, publication, review).
* Optional `courseId`: Course identifier for admin filtering.
* Optional `outcome`: Transition outcome ('success', 'rejected', 'failed').
* Optional `reason`: Human rationale for the mutation or rejection.
* `createdAt`
* Indexed on `(entityType, entityId, createdAt)`, `(actorId, createdAt)`, and `(courseId, outcome, createdAt)`.

### exams
* `id`
* `courseId`
* `title`
* `duration`: Allotted countdown limit in minutes.
* `status`: Publishing state ('draft', 'published', 'ended').
* `createdAt`
* `updatedAt`

### questions
* `id`
* `examId`
* `questionText`
* `options`
* `correctAnswer`
* `explanation`
* `order`
* `createdAt`
* `updatedAt`

### submissions
* `id`
* `userId`: Foreign key to `user.id`.
* `examId`: Foreign key to `exams.id`.
* `status`: Submission review state ('completed', 'pending_review', 'graded', 'late').
* `score`: Calculated or graded numeric score.
* `teacherNotes`: Feedback and notes provided by tutor or teacher upon grading.
* `answersSnapshot`: Serialized map of student picks.
* `questionsSnapshot`: Serialized snapshot of questions at attempt time.
* `submittedAt`: Submission timestamp.
* `attemptNumber`: Attempt index per user per exam.
* Unique index: `idx_submissions_user_exam_attempt` on `(userId, examId, attemptNumber)`.

### aiMaterialInstances
These tables are read-only compatibility data. The Admin `material-instances` CRUD and retry endpoint return HTTP 410 after authorization.

* `id`
* `courseId`
* `status`
* `error`
* `createdAt`
* `updatedAt`

### aiMaterialInstanceSections
* `id`
* `materialInstanceId`
* `title`
* `markdown`
* `order`
* `createdAt`
* `updatedAt`

### aiMaterialInstanceChunks
* `id`
* `sectionId`
* `content`
* `order`
* `createdAt`
* `updatedAt`

---

## 18. AI Prompt Contracts & Provenance Domain

### ai_generation_traces
* `id`: Text primary key (`trc_...`).
* `userId`: Reference to `user.id` (nullable).
* `useCase`: Model routing identity or use case identifier.
* `stageId`: Pipeline stage identifier (e.g. 'tutor-explanation', 'ko-extraction').
* `promptVersion`: Version string of the stage prompt.
* `policyVersion`: Combined version string of applied policy fragments.
* `inputSchemaVersion`: Version of input variable schema.
* `outputSchemaVersion`: Version of output JSON schema.
* `validatorVersion`: Combined version string of semantic validators.
* `sanitizedInputHash`: Privacy-safe SHA-256 hash of input variables (never raw text/student copy).
* `evidenceHash`: Optional SHA-256 hash of context evidence data.
* `model`: LLM model name used for generation.
* `route`: Routing chain or failover provider mode.
* `inputTokens`: Cumulative input token count across attempts.
* `outputTokens`: Cumulative output token count across attempts.
* `retryCount`: Number of repair attempts executed (0 or 1).
* `terminalOutcome`: Terminal state ('success', 'rejected', 'quota_exceeded', 'provider_failure', 'invalid_contract').
* `violationCodes`: Serialized JSON array of validation error codes.
* `latencyMs`: Total generation and validation latency in milliseconds.
* `cacheResult`: Cache status ('hit', 'miss', 'none').
* `createdAt`: Timestamp when the trace was recorded.


## 19. Knowledge Object Provenance Domain

### knowledge_objects (V2 Extensions)
* `stableKey`: Deterministic hash key derived from source document, chapter, and concept identity.
* `semanticHash`: SHA-256 hash of normalized concept title, summary, knowledgeKind, and instructionalRole.
* `version`: Integer version counter incremented on semantic changes.
* `knowledgeKind`: Categorical content kind ('definition', 'principle', 'formula', 'procedure', 'example', 'constraint', 'misconception', 'other').
* `instructionalRole`: Instructional role ('core', 'prerequisite', 'enrichment', 'assessment_support', 'reference').

### extraction_runs
* `id`: Primary key (`exr_...`).
* `mtdId`: FK to `masterTeachingDocuments.id`.
* `chapterId`: FK to `chapters.id`.
* `state`: Lifecycle state ('staged', 'accepted', 'needs_review', 'failed', 'superseded').
* `createdBy`: User or system ID.
* `createdAt`, `updatedAt`

### knowledge_object_sources
* `id`: Primary key (`kos_...`).
* `koId`: FK to `knowledgeObjects.id`.
* `sourceDocumentId`: Source document identifier.
* `sourceVersion`: Source document version.
* `chapterId`: Chapter identifier.
* `startOffset`, `endOffset`: Character offsets within source text.
* `sourceHash`: Hash of full source chunk text.
* `excerptHash`: Hash of exact supporting text span.
* `extractionRunId`: FK to `extraction_runs.id`.
* `supportRole`: Role of source span ('core', 'prerequisite', etc.).

### learning_objectives
* `id`: Primary key (`lob_...`).
* `courseId`: FK to `courses.id`.
* `chapterId`: FK to `chapters.id`.
* `objectiveText`: Text of the learning objective.
* `bloomLevel`: Bloom cognitive level ('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create').
* `evidenceSourceIds`: JSON array of source IDs.
* `relatedKoIds`: JSON array of linked KO IDs.
* `status`: Objective status ('active', 'superseded').

## 20. Assessment Integrity V2 Contract

Plan 010 reuses the additive assessment tables without changing legacy quiz snapshots or adding a migration:

* `blueprint_asesmen` stores the versioned assessment type and serialized blueprint.
* `asesmen` stores the published assessment version and its immutable status.
* `cakupan_asesmen` enforces chapter membership. Application validation requires one chapter for a quiz and at least one for a tryout.
* `item_asesmen` stores rendered question, option order, grading policy, content version, and generation hash snapshots.
* `percobaan_asesmen` and `jawaban_murid` preserve the rendered question, option order, response, grading policy, and content version at attempt time.
* `bukti_ide_jawaban` stores per-Idea score contribution, weight, confidence, rubric version, derivation status, and the invariant that ambiguous evidence cannot affect mastery.
* `quiz_templates` acts as a legacy compatibility projection; all quiz creation flows write canonical `asesmen` and `blueprint_asesmen` first, then mirror to `quiz_templates`.

The runtime adds stable option IDs inside the existing JSON snapshots as an additive compatibility field and does not rewrite historical `questions_snapshot`, `answers_snapshot`, or `mastery_before` values.

The compatibility submit bridge is flag-gated by the complete canonical rollout set. It uses deterministic IDs compatible with the legacy backfill, writes no rows when any question mapping is missing or stale, and leaves legacy attempt and answer snapshots authoritative. Holdout and unreviewed content never contributes to `bukti_ide_jawaban`.


## 22. Google Spreadsheet Export

### export_spreadsheets
Tracks the single in-place Google Spreadsheet per entity instance (form, quiz, pka, system).

* `id`: Primary key (`{entityType}_{entityId}`).
* `entityType`: `'form' | 'quiz' | 'pka' | 'system'`.
* `entityId`: Entity instance id.
* `spreadsheetId`: Google Sheets file id.
* `spreadsheetUrl`: Edit URL.
* `driveFolderId`: Google Drive folder under `Zyx Export/{domain}`.
* `folderPath`: Canonical folder path joined by `/`.
* `lastHeaderCount`: Number of columns in the last owned data block written by the app (conflict baseline).
* `lastRowCount`: Number of rows (header + data) in the last owned data block written by the app (conflict baseline).
* `lastWrittenFingerprint`: SHA-256 of the last owned data block written by the app; used to detect manual edits before overwrite.
* `createdAt` / `updatedAt`: Timestamps.

The app owns only the data block at A1 (header + data rows). Cells right of the block and rows below it are the reserved manual zone and are never overwritten. Before an overwrite, the current grid is diffed against `lastWrittenFingerprint` and the stored row/column counts; conflicts return `needsConfirmation` with `block_modified`, `manual_rows`, or `manual_columns` codes.

## 23. Meet, Form Presets & Important Links

### google_meet_sessions (new columns)
Extension columns on the PKA Google Meet review session table (migration 0065).

* `slug`: Unique stable short-link slug used by the shared public `/f/[slug]` resolver. Indexed (`idx_meet_slug`, plus a unique index). Application validation also prevents active Form and Meet records from sharing a slug.
* `hostEmail`: Signed-in creator email after successful `COHOST` provisioning. The Google OAuth principal remains the organizer.
* `coHostEmails`: JSON array of emails successfully provisioned with the Meet `COHOST` role.
* `invitedEmails`: JSON array of emails successfully provisioned as Meet space members.

### custom_form_presets
Reusable Form Studio presets (question blueprints + settings) that admins can save and re-apply. Standard admin capability, always-on.

* `id`: Primary key.
* `name`: Preset name.
* `description`: Optional description.
* `category`: `'survey' | 'quiz' | 'feedback' | 'registration'`.
* `questions`: JSON array of question blueprints.
* `settings`: JSON settings payload.
* `createdById`: Creator user reference (set null on delete).
* `createdAt` / `updatedAt`: Timestamps.
* Index: `idx_custom_form_presets_category`.

### google_forms
Google Forms registry for forms created through the Google Forms API.
* `id`
* `formId`: Unique Google Forms form identifier.
* `title`, `description`
* `responderUri`, optional `editUri`
* `category`: 'survey', 'quiz', 'feedback', or 'registration'.
* `createdById`: Optional creator user reference.
* `deletedAt`: Soft-delete timestamp.
* `createdAt` / `updatedAt`

### custom_forms
Zyx-owned Form Studio definitions sharing the `/f/[slug]` resolver with Meet sessions.
* `id`
* `slug`: Unique stable slug; active slugs cannot collide with active Meet sessions.
* `title`, `description`
* `category`: 'survey', 'quiz', 'feedback', or 'registration'.
* `questions`: JSON array of question blueprints.
* `settings`: JSON payload (acceptingResponses, collectEmail, schedule windows, shuffle, file size limit, response copy, etc.).
* Timestamps plus lifecycle fields per the schema definition.

### custom_form_responses
Submitted answers for custom forms; file uploads use the structured `forms/` R2 key hierarchy.
* `id`
* `formId`: FK to `customForms.id`.
* `responderUserId`: Optional authenticated responder.
* `responderEmail`: Optional collected email.
* `answers`: JSON map of question answer payloads.
* `submittedAt`, `createdAt`

### important_links
Curated important links library (Tautan) managed by admins. Always-on.

* `id`: Primary key.
* `title`: Link title.
* `url`: Target URL.
* `description`: Optional description.
* `icon`: Optional icon name.
* `category`: Optional grouping key for the public page.
* `color`: Optional accent color.
* `sortOrder`: Deterministic ordering on the public page.
* `isActive`: Whether the link shows on the public `/tautan` page.
* `createdById`: Creator user reference (set null on delete).
* `deletedAt`: Soft-delete timestamp.
* `createdAt` / `updatedAt`: Timestamps.
* Indexes: `idx_important_links_category`, `idx_important_links_active`.

## Zyra Plans 010 through 013 tables

### `zyra_message_attachments`

Stores sanitized private learner image metadata only. Each row is scoped to `student_id`, `course_id`, and `session_id`, and contains an opaque private object key, sanitized MIME, byte size, dimensions, sanitizer version, sanitized hash, status, expiry, deletion time, and provider dispatch time. Source bytes, original filenames, EXIF, GPS, public URLs, and prompt text are not stored.

### `zyra_proposals`

Stores tutor and admin proposal-first records. JSON columns contain only validated scope, evidence references, precondition snapshot, typed operations, learner impact, reversibility, warnings, proposer trace, and validator result. Status, precondition version, diff hash, audit link, expiry, review, confirmation, and application timestamps support fail-closed lifecycle handling.

### `zyra_proposal_events`

Append-only lifecycle events for proposal creation, review, confirmation, rejection, expiry, failure, and future application. Each event binds the proposal, actor, status transition, stable reason code, and diff hash.

### `zyra_operational_events`

Fixed-column privacy-safe operational events. Columns are version, event kind, route class, masked project slot, model, bounded latency and size buckets, result and reason codes, actor and course pseudohashes, feature version, and creation time. The table intentionally has no free-form payload column.

Migration `0067_zyra_continuation.sql` also adds these Plan 010 through 013 records. Legacy chat, quiz, allowance, and analytics rows remain readable and are not backfilled by these plans.

## 24. Search & Discovery Domain

### `search_documents`

Canonical unified search index table for site-wide and semantic search indexing across courses, chapters, materials, quizzes, exams, blog articles, forms, and static navigation routes.

* `id`: Primary key text identifier formatted with entity prefix (e.g. `course_123`, `chapter_456`, `material_789`, `quiz_abc`, `exam_def`, `blog_ghi`, `nav_dashboard`, `form_jkl`).
* `entityType`: Discriminated entity type string (`course` | `chapter` | `material` | `quiz` | `exam` | `blog` | `nav` | `form`).
* `entityId`: Optional raw entity identifier.
* `courseId`: Optional course identifier for course-scoped entities.
* `title`: Human-readable title for search result display.
* `searchableText`: Aggregated textual content including title, summary, body, tags, and keywords for lexical and semantic indexing.
* `path`: Destination route or web path for navigation upon selection.
* `minRole`: Minimum access level required to view the search document (0: public, 1: student, 2: tutor, 3: admin).
* `isSynced`: Boolean flag indicating whether vector embedding synchronization is complete.
* `createdAt` / `updatedAt`: Timestamps.

Indexes:
* `idx_search_documents_entity`: Composite index on `(entity_type, entity_id)`
* `idx_search_documents_synced`: Index on `is_synced`
* `idx_search_documents_min_role`: Index on `min_role`
* `idx_search_documents_course`: Index on `course_id`

## Coding learning

Generated migration `0099_hard_meteorite.sql` adds `coding_problems` (immutable private snapshots keyed by ID and
version, canonical course and author), `coding_drafts` (learner/course/key with
optimistic revision), and `coding_attempts` (owner, problem version, surface,
idempotency request, ordinal, immutable code, evaluation, status and fenced lease).
Public projections exclude solutions and private tests. See
[coding contract](coding-foundation.md). Local SQLite migration is verified;
remote migration is a separate operation.

## Admin operation outbox

Status: `ACTIVE`

`admin_operation_jobs` is defined in `db/schema.ts`, migration `drizzle-postgres/0005_violet_maelstrom.sql`. Columns: `id` primary key; `actor_id` references `pengguna` with restricted deletion; `session_id`; `kind`; `required_scope`; `environment`; JSON `payload`; `status` (`queued`, `running`, `succeeded`, `failed`, `unknown`, `cancelled`); JSON `result`; sanitized `error_code`; `created_at`; `updated_at`. Queue and actor indexes order by creation time. Payloads may contain private recipient or response metadata and must never be returned by generic job reads. Successful media uploads clear stored file bytes. This PostgreSQL migration was applied to staging on 2026-11-05; production application is unverified. See [Admin MCP operations](operations/admin-mcp.md).

### `public_demo_snapshots`

The code defines `id` text primary key, `course_id` text unique not null with cascading foreign key to `mata_kuliah.id`, `snapshot` jsonb not null, and `updated_at` timestamptz not null default now. Each row opts in one canonical course for the intended demo; the V2 JSON requires `contentPolicy` equal to `free-first-chapter` and supports fictional `mockChapters`; V1 fails validation. The JSONB shape change alone requires no new schema migration; see [seeding handoff](operations/public-demo-seeding.md). Migration was applied to staging on 2026-11-05; seed application remains unverified.

## Pricing settings

`pricing_settings` stores a single `default` row with `discounts` JSONB and `updated_at`. JSON contains independent `platform` and `tutorial` schedules: integer `percent` from 0 to 100, `startsOn`, and inclusive `endsOn` calendar dates in WIB. Admin writes validate the complete payload before an atomic upsert. A database check restricts the singleton key. A missing row uses the expired original campaign; database read failures do not silently substitute defaults.

## AI model settings

Status: `ACTIVE`

`ai_model_settings` is defined in `db/schema.ts` with generated PostgreSQL migration `drizzle-postgres/0006_large_rocket_racer.sql`. Columns: `feature` text primary key matching a registered `ModelFeature` identifier; JSONB `models` storing an ordered three-element array of distinct ordinary-routing `ModelId` values (`[primary, fallback1, fallback2]`); non-null `updated_by` text recording the saving admin identifier; `updated_at` non-null timestamp with time zone. Absence of a row preserves the exact built-in runtime default chain for that feature. Migration `0006` was applied with the guarded `bun run db:migrate` runner to staging branch `br-gentle-scene-azq0gp91` on 2026-11-06. Read-back verified the table, matching migration ledger, and zero configured rows. Read-only staging checks verified all 21 default model views and chains plus local request orchestration with stubbed provider and allowance services. Authenticated hosted-page and live-provider behavior remain unverified. Production migration remains unverified and requires its own authorized target check before rollout.
