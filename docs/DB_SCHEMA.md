# Zyx Database Schema Reference

This document provides a detailed reference of the SQLite/Turso database schema defined in [db/schema.ts](../db/schema.ts). 

---

## High Level Overview

The Zyx ecosystem relies on SQLite locally (`dev.db`) and Turso in production. Migrations are managed via Drizzle ORM. 
- **Time Representation**: All timestamps are stored as SQLite `integer` values representing Unix milliseconds and are mapped to Javascript `Date` objects.
- **Foreign Keys**: Cascade deletes are used extensively to maintain integrity across course-specific content.

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
* `createdAt`
* `updatedAt`

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
* `totalQuotaSessions`: Total meeting quota per semester (default 15).
* `usedQuotaSessions`: Total meeting sessions used in the current semester (default 0).
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
* `sessionDate`: Optional explicit ISO date string (YYYY-MM-DD).
* `createdAt`

### bookings
* `id`
* `slotId`: Unique reference to booked tutor slot (FCFS per slot).
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

### bookingAuditLogs
* `id`
* `bookingId`: Reference to `bookings`.
* `groupId`: Reference to `groups`.
* `actorId`: Reference to `user` (student, tutor, or admin).
* `action`: Action type ('BOOK_CREATED', 'SLOT_MOVED', 'TOPIC_UPDATED', 'ATTACHMENT_UPLOADED', 'RESCHEDULE_REQUESTED', 'RESCHEDULE_APPROVED', 'RESCHEDULE_REJECTED', 'BOOKING_CANCELLED', 'SESSION_COMPLETED', 'NOTES_ADDED').
* `summary`: Human-readable activity sentence.
* `metadata`: JSON payload containing action details.
* `createdAt`

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
* `id`, `code`, `title`, `status`
* `legacyCourseId`: Optional compatibility reference to `courses.id`.
* `createdAt`, `updatedAt`

### bab
* `id`, `mataKuliahId`, `code`, `title`, `orderIndex`, `status`
* `legacyChapterId`: Optional compatibility reference to `chapters.id`.
* `(mataKuliahId, code)` and `(mataKuliahId, orderIndex)` are unique.

### pendaftaranMurid
* `id`, `penggunaId`, `mataKuliahId`, `status`
* `startAt`, `endAt`
* `legacyEnrollmentId`: Optional compatibility reference to `enrollments.id`.

### penugasanTutor
* `id`, `penggunaId`, `mataKuliahId`, `status`, `assignmentScope`
* `legacyTutorCourseId`: Optional compatibility reference to `tutor_courses.id`.

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

### conceptGraphEdges
* `id`
* `courseId`
* `sourceConcept`: Starting concept slug.
* `targetConcept`: Destination concept slug.
* `type`: Dependency relation ('prerequisite', 'related').

### chapterAliases
* `id`
* `chapterId`
* `aliasName`: Text variation of chapter name, used to automatically map raw text mentions to chapters.
* `createdAt`

## 5.2 Product, Assessment, Evidence, and Bundle Domain

Plan 004 adds the normalized target tables below. Plan 005 owns deterministic mapping and backfill. Existing English product, assessment, attempt, flashcard, learning-event, and mastery tables remain active and authoritative for reads during the expand phase.

### Product tables
* `artikel`, `artikel_ide`, `blok_artikel`: Markdown article versions, Idea links, and ordered blocks.
* `diktat_materi`, `diktat_ide`, `diktat_pembahasan`, `item_diktat_pembahasan`: Material and explanation versions with Idea links and question snapshots.
* `soal`, `soal_ide`, `soal_relasi_ide`, `pembahasan_soal`: Versioned questions, `zyx_original` or `itb_example` origin, optional ITB source event and reference, multi-Idea weights, independent relation metadata, and solutions.
* `set_flashcard`, `flashcard`, `flashcard_ide`: Versioned flashcard sets and multi-Idea links.
* `kemajuan_flashcard_murid`, `review_flashcard`: Per-murid scheduling state and review history.

Published Product Bundle article, material, question, solution, and flashcard records are required by the Product contract layer to reference at least one published Idea. Manual, Markdown, and MCP Bank Soal authoring may store a canonical question with zero `soal_ide` rows. When question links are present, `soal_ide.weight` has a database range check and the per-question sum is validated within `0.000001` by the authoring service.

Manual and Markdown question authoring uses these canonical tables first. `ai_question_bank` remains the compatibility projection for the current quiz readers; its row uses the canonical question ID and mirrors the lifecycle, prompt, options, answer keys, explanation, and generation hash.

### Assessment tables
* `blueprint_asesmen`, `asesmen`, `cakupan_asesmen`: Assessment definition, version, lifecycle, and chapter scope.
* `item_asesmen`: Ordered question membership with rendered question, option order, grading policy, content version, and generation snapshots.
* `percobaan_asesmen`, `jawaban_murid`: Historical attempt and answer records with required immutable snapshot fields.

Quiz and tryout cardinality is enforced by the assessment contract: a quiz has exactly one chapter and a tryout has at least one chapter. Foreign keys and unique indexes protect assessment item and answer membership.

### Evidence and mastery tables
* `bukti_ide_jawaban`, `bukti_pembelajaran`: Idea-level evidence with contribution, confidence, source, rubric version, and derivation status. `bukti_pembelajaran` has a unique idempotency key across source, Idea, and rubric.
* `pemahaman_ide`: Separate `skor` and `keyakinan` values, each bounded from 0 to 100, plus `algorithm_version` and `input_watermark` for deterministic replay.
* `perubahan_pemahaman`, `rekomendasi_flashcard`: History-safe mastery transitions and due recommendations. Change rows retain `evidence_ids`, algorithm version, and watermark.

### Zyra personalization tables

AI Plan 008 adds three additive tables through migration `0067_zyra_continuation.sql`:

* `zyra_learning_events`: course-scoped, bounded learner evidence with event kind, source type, outcome, latency bucket, hint level, representation, weight, and retention expiry. It may reference an Idea but never stores raw conversation content.
* `zyra_learner_profiles`: one inferred adaptation profile per murid and course, including version, inferred presentation fields, confidence, evidence count, expiry, reset watermark, and reason codes.
* `zyra_learner_preferences`: one explicit presentation preference record per murid and course, kept separate from inferred profile fields.

The migration adds foreign keys and query indexes only. Existing attempt, learning-event, mastery, recommendation, and assessment tables are unchanged. Personalization reads are deterministic and do not replace the authoritative mastery or assessment systems.

Ambiguous evidence is stored with explicit status and the schema check prevents it from being marked as mastery-affecting. Plan 011 recomputes only the additive per-Idea tables; no legacy mastery, learning-event, answer, or review row is rewritten.

### Bundle and audit tables
* `impor_bundle`, `item_impor_bundle`: Checksum-identified import and entity inventory, optional legacy course association, JSON validation report, and public Product Bundle status `draft`, `published`, or `withdrawn`. Legacy Idea workflow status values remain readable.
* `review_bundle`, `publikasi_bundle`: Internal review evidence and publication record. Product publication records or refreshes the responsible admin approval without exposing review as a separate public lifecycle state.
* `audit_mutasi`: Actor, entity, action, snapshots, correlation ID, and timestamp for mutation auditability.

Plan 006 uses these tables as a staged workflow. Uploads do not write canonical source or Idea rows. A matching bundle ID and checksum is idempotent; a different checksum is a conflict. Publication updates staged item status and the approved bundle in one transaction with canonical source, chunk, Idea, provenance, relation, audit, and vector outbox writes.

Plan 008 reuses the same import, item, review, publication, audit, dependency, and vector outbox tables for Product Bundle V2. Draft replacement rewrites only the import inventory and R2 artifact before publication. Publication inserts canonical article, diktat, question, solution, flashcard, and assessment blueprint rows after traceability and dependency checks pass. Withdrawal marks canonical rows inactive or retired according to their existing table contract and adds vector delete jobs. Question products are exclusively ITB examples and require `itbSource`, ITB curation, typed option IDs with deterministic correct markers, exactly one paired solution, and a HOT cognitive level for multi-Idea questions. Correct markers remain inside the private `soal.options_snapshot` grading representation and are redacted from runtime and vector content. Versions greater than one use versioned product IDs so prior rows remain queryable.

Migration `0068_typical_warbird.sql` adds `origin`, `source_event_name`, and `source_reference_id` to both `soal` and `ai_question_bank`, with `zyx_original` as the non-null default and an origin plus event index on each table. Existing rows therefore remain Zyx originals without a data rewrite. Product publication validates ITB completeness before writing and creates the `ai_question_bank` compatibility projection. Product Bundle source and curation data are retained in the publication audit snapshot, while `soal_itb_referensi.soal_id` links the single source reference to its published question. Article to Diktat lineage is validated through bundle dependency rows and generation hashes. Live legacy quiz submissions use the existing `item_asesmen`, `jawaban_murid`, and `bukti_ide_jawaban` tables to append canonical evidence only after exact published-question and published-Idea checks pass.

### Plan 005 migration tables
* `legacy_backfill_exceptions`: Zero-loss preservation ledger for a legacy row that has no exact additive representation. It stores `runId`, source table and ID, reason code, preservation path, source checksum, details, and `blocksCutover`.
* `peta_id_legacy`: One-to-one source and target identity mapping with mapping version and source and target checksums.
* `migration_runs`, `migration_checkpoints`: Resumable run state and bounded batch checkpoints used by the staging backfill engine.

Plan 005 populated the additive targets where the mapping was exact and recorded compatibility-only rows instead of inventing target data. Legacy source tables remain queryable during the expand phase. The no-read-switch rule remains in force until a later plan.

---

## 6. Assessment & Ingestion Domain

### assessmentSources
* `id`
* `courseId`
* `title`
* `origin`: Ingestion starting point (e.g. 'uploaded').
* `category`: Type of assessment document (e.g. 'uts', 'uas', 'kuis', 'tutorial').
* `year`: Academic calendar year of the assessment.
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
* `chapterIds`: Associated chapter list stored as a JSON array.
* `thumbnailUrl`: Page 1 thumbnail preview image path.
* `createdAt`
* `updatedAt`

---

## 8. Quiz System

### quizTemplates
* `id`
* `courseId`
* `title`
* `description`
* `timeLimit`: Countdown duration allowed for the quiz in seconds.
* `selectionRules`: Selection parameter guidelines for picking questions stored as JSON.
* `category`: Quiz type classification ('daily', 'weekly', 'chapter', 'premium', 'simulation').
* `createdAt`
* `updatedAt`

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

### pkaSchedules
* `id`
* `title`
* `description`
* `googleMeetLink`: URL for the video conference.
* `scheduledAt`: Date and time of the review session.
* `durationMinutes`: Session length in minutes.
* `createdAt`
* `updatedAt`

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
* `origin`: `zyx_original` for normal bank questions or `itb_example` for Product Bundle projections. Existing rows default to `zyx_original`.
* `sourceEventName`: Required by the application contract for `itb_example`; null for Zyx originals.
* `sourceReferenceId`: Allowed ITB reference ID for `itb_example`; null for Zyx originals.
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
* `koId`
* `action`: Mutation command ('upsert', 'delete').
* `status`: Sync state ('pending', 'synced', 'failed').
* `error`: Log messages if sync action failed.
* `retries`: Re-attempt count pointer.
* `namespace`: Canonical Vectorize namespace routing pointer.
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
* `examId`
* `studentId`
* `answersSnapshot`: Serialized map of student picks.
* `score`
* `completed`
* `createdAt`
* `updatedAt`

### aiMaterialInstances
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
Reusable Form Studio presets (question blueprints + settings) that admins can save and re-apply. Gated by `FEATURE_FORM_PRESETS=1`.

* `id`: Primary key.
* `name`: Preset name.
* `description`: Optional description.
* `category`: `'survey' | 'quiz' | 'feedback' | 'registration'`.
* `questions`: JSON array of question blueprints.
* `settings`: JSON settings payload.
* `createdById`: Creator user reference (set null on delete).
* `createdAt` / `updatedAt`: Timestamps.
* Index: `idx_custom_form_presets_category`.

### important_links
Curated important links library (Tautan) managed by admins. Gated by `FEATURE_LINK_LIBRARY=1`.

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
