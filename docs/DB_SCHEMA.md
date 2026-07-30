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
* `role`: User permissions tier, which can be 'admin', 'teacher', or 'student'.
* `createdAt`
* `updatedAt`

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
* `courseId`
* `name`: Cohort or class name (e.g. Class A, Cohort 2026).
* `createdAt`
* `updatedAt`

### groupMembers
* `id`
* `groupId`
* `userId`
* `createdAt`

### enrollmentTokens
* `id`
* `groupId`
* `token`: Pre-generated unique registration token.
* `capacity`: Maximum number of times the token can be claimed.
* `claimsCount`: Total claims made so far.
* `expiresAt`: Date after which the token becomes invalid.
* `createdAt`
* `updatedAt`

### enrollmentTokenCourses
* `id`
* `token`
* `courseId`

---

## 3. Tutor & Scheduling Domain

### tutorCourses
* `id`
* `tutorId`
* `courseId`

### tutorSlots
* `id`
* `tutorId`
* `dayOfWeek`: Day index (0 = Sunday, 6 = Saturday) of availability.
* `startTime`: Time string representing session start (e.g. "09:00").
* `endTime`: Time string representing session end (e.g. "10:00").

### bookings
* `id`
* `studentId`
* `tutorId`
* `slotId`
* `bookingDate`: Target date string (yyyy-mm-dd) of the appointment.
* `createdAt`

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
* `type`: Upload category, either 'materi_kelas' (class slides) or 'contoh_soal' (sample questions).
* `fileUrl`: Public URL path pointing to uploaded asset.
* `chapterIds`: Associated chapter list stored as a JSON array.
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

### aiQuestionBank
* `id`
* `courseId`
* `knowledgeObjectId`
* `sourceMtdId`
* `sourceSectionId`
* `styledAfterAssessmentObjectId`: Optional reference link to an original exam question style source.
* `pattern`: Pedagogical classification pattern.
* `reasoningType`: Mode of thinking needed.
* `applicationLevel`: Cognitive level matching pedagogical standards.
* `estimatedSteps`: Estimate count of reasoning steps.
* `questionText`: The final question text.
* `correctAnswer`: Correct solution statement text.
* `distractorMap`: Distractors list mapping potential student errors.
* `explanation`: Explanatory details supporting the answer.
* `generationHash`: Validation checksum matching current settings state.
* `isStale`: Re-evaluation flag matching source document state.
* `createdAt`
* `updatedAt`

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
* `namespace`: Pinecone metadata routing pointer.
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
* `type`: Categorization category ('quiz_published', 'flashcard_reminder', 'tutor_reminder', 'payment_success', 'admin_broadcast').
* `read`: Toggle indicator showing if notification has been read.
* `readAt`: Timestamp when the user read the notification.
* `metadata`: Dynamic data attributes dictionary payload (JSON).
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


