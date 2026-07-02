import { relations, sql } from "drizzle-orm";
import {
 sqliteTable,
 text,
 integer,
 real,
 index,
 unique,
 uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Enums
/** Admin drive ; folder tree + file pointers to UploadThing. */

/** Better Auth core model ; export name must be `user` for the Drizzle adapter. */
export const user = sqliteTable("user", {
 id: text("id").primaryKey(),
 name: text("name").notNull(),
 email: text("email").notNull().unique(),
 emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
 image: text("image"),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => /* @__PURE__ */ new Date())
 .notNull(),
 role: text("role").$type<"admin" | "teacher" | "student">().default("student"),
 lastActivityAt: integer("last_activity_at", { mode: "timestamp" }),
});

export const session = sqliteTable(
 "session",
 {
 id: text("id").primaryKey(),
 expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
 token: text("token").notNull().unique(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => /* @__PURE__ */ new Date())
 .notNull(),
 ipAddress: text("ip_address"),
 userAgent: text("user_agent"),
 userId: text("user_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 },
 (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
 "account",
 {
 id: text("id").primaryKey(),
 accountId: text("account_id").notNull(),
 providerId: text("provider_id").notNull(),
 userId: text("user_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 accessToken: text("access_token"),
 refreshToken: text("refresh_token"),
 idToken: text("id_token"),
 accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
 refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
 scope: text("scope"),
 password: text("password"),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => /* @__PURE__ */ new Date())
 .notNull(),
 },
 (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
 "verification",
 {
 id: text("id").primaryKey(),
 identifier: text("identifier").notNull(),
 value: text("value").notNull(),
 expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => /* @__PURE__ */ new Date())
 .notNull(),
 },
 (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
 sessions: many(session),
 accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
 user: one(user, {
 fields: [session.userId],
 references: [user.id],
 }),
}));

export const accountRelations = relations(account, ({ one }) => ({
 user: one(user, {
 fields: [account.userId],
 references: [user.id],
 }),
}));

export const driveItem = sqliteTable(
 "drive_item",
 {
 id: text("id").primaryKey(),
 /** `null` = My Drive root. FK ke `drive_item.id` ada di migration SQL (referensi Drizzle menghindari inference sirkuler). */
 parentId: text("parent_id"),
 kind: text("kind").$type<"folder" | "file">().notNull(),
 name: text("name").notNull(),
 /** UploadThing `key` ; set only when `kind === "file"`. */
 uploadthingKey: text("uploadthing_key"),
 ufsUrl: text("ufs_url"),
 mimeType: text("mime_type"),
 sizeBytes: integer("size_bytes"),
 createdByUserId: text("created_by_user_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => /* @__PURE__ */ new Date())
 .notNull(),
 },
 (table) => [
 index("drive_item_parent_idx").on(table.parentId),
 index("drive_item_created_by_idx").on(table.createdByUserId),
 ],
);

export const driveItemRelations = relations(driveItem, ({ one, many }) => ({
 creator: one(user, {
 fields: [driveItem.createdByUserId],
 references: [user.id],
 }),
 parent: one(driveItem, {
 fields: [driveItem.parentId],
 references: [driveItem.id],
 relationName: "drive_item_tree",
 }),
 children: many(driveItem, { relationName: "drive_item_tree" }),
}));

// Courses Table
export const courses = sqliteTable("courses", {
 id: text("id").primaryKey(),
 title: text("title").notNull(), 
 category: text("category", { enum: [
 "Matematika",
 "Fisika",
 "Astronomi",
 "Kimia",
 "Aktuaria",
 "Mikrobiologi",
 "Biologi",
 "Rekayasa Hayati",
 "Rekayasa Pertanian",
 "Rekayasa Kehutanan",
 "Teknologi Pasca Panen",
 "Sains dan Teknologi Farmasi",
 "Farmasi Klinik dan Komunitas",
 "Teknik Pertambangan",
 "Teknik Perminyakan",
 "Teknik Geofisika",
 "Teknik Metalurgi",
 "Teknik Geologi",
 "Meteorologi",
 "Oseanografi",
 "Teknik Geodesi dan Geomatika",
 "Teknik Kimia",
 "Teknik Fisika",
 "Teknik Industri",
 "Teknik Pangan",
 "Manajemen Rekayasa",
 "Teknik Bioenergi dan Kemurgi",
 "Teknik Industri (Kampus Cirebon)",
 "Teknik Elektro",
 "Teknik Informatika",
 "Teknik Tenaga Listrik",
 "Teknik Telekomunikasi",
 "Sistem dan Teknologi Informasi",
 "Teknik Biomedis",
 "Teknik Mesin",
 "Teknik Dirgantara",
 "Teknik Material",
 "Teknik Sipil",
 "Teknik Lingkungan",
 "Teknik Kelautan",
 "Rekayasa Infrastruktur Lingkungan",
 "Teknik dan Pengelolaan Sumber Daya Air",
 "Arsitektur",
 "Perencanaan Wilayah dan Kota",
 "Perencanaan Wilayah dan Kota (Kampus Cirebon)",
 "Seni Rupa",
 "Kriya (Kampus Cirebon)",
 "Kriya",
 "Desain Interior",
 "Desain Komunikasi Visual",
 "Desain Produk",
 "Manajemen",
 "Kewirausahaan",
 "TPB",
 "Rekayasa Umum",
 "PKA",
 ] }).notNull(),
 description: text("description"),
});

// Enrollments Table
export const enrollments = sqliteTable("enrollments", {
 id: text("id").primaryKey(),
 userId: text("user_id").references(() => user.id).notNull(),
 courseId: text("course_id").references(() => courses.id).notNull(),
 enrolledAt: integer("enrolled_at", { mode: "timestamp" }).defaultNow(),
 expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(), // Locks out students once the semester ends
});

// Progress (Materials) Table
export const progress = sqliteTable("progress", {
 id: text("id").primaryKey(),
 userId: text("user_id").references(() => user.id),
 materialId: text("material_id"), // Ideally references a materials table
 status: text("status").default("completed"),
 completedAt: integer("completed_at", { mode: "timestamp" }).defaultNow(),
});

// Exams (Quizzes and Tryouts) Table
export const exams = sqliteTable("exams", {
 id: text("id").primaryKey(),
 courseId: text("course_id").references(() => courses.id).notNull(),
 title: text("title").notNull(),
 type: text("type").$type<"quiz" | "tryout">().notNull(), // Specifies if it is a quiz or tryout
 status: text("status").$type<"draft" | "published" | "ended">().default("draft").notNull(), // Can be draft, published, or ended
 settings: text("settings", { mode: "json" }), // Stores specific limits like "only three submissions" or "one time only"
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
});

// Questions Table
export const questions = sqliteTable("questions", {
 id: text("id").primaryKey(),
 examId: text("exam_id").references(() => exams.id).notNull(),
 type: text("type").notNull(), // 'short_answer', 'multiple_choice', 'essay'
 content: text("content", { mode: "json" }).notNull(), // Hybrid approach using JSON blob for question data, options, and correct answers
 order: integer("order").notNull(),
});

// Submissions Table
export const submissions = sqliteTable("submissions", {
 id: text("id").primaryKey(),
 userId: text("user_id").references(() => user.id).notNull(),
 examId: text("exam_id").references(() => exams.id).notNull(),
 status: text("status").$type<"completed" | "pending_review" | "graded" | "late">().default("completed").notNull(), // Uses "pending_review" for essays
 score: integer("score"), // Stores calculated score
 teacherNotes: text("teacher_notes"), // Allows teacher to manually input feedback/notes
 answersSnapshot: text("answers_snapshot", { mode: "json" }),
 questionsSnapshot: text("questions_snapshot", { mode: "json" }),
 submittedAt: integer("submitted_at", { mode: "timestamp" }).defaultNow(),
});

// Groups Table
export const groups = sqliteTable("groups", {
 id: text("id").primaryKey(),
 name: text("name").notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
});

// Group Members Table (Many-to-Many between User and Groups)
export const groupMembers = sqliteTable(
 "group_members",
 {
 id: text("id").primaryKey(),
 groupId: text("group_id")
 .notNull()
 .references(() => groups.id, { onDelete: "cascade" }),
 userId: text("user_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 joinedAt: integer("joined_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("group_members_group_idx").on(table.groupId),
 index("group_members_user_idx").on(table.userId),
 ]
);

// Enrollment Tokens Table
export const enrollmentTokens = sqliteTable("enrollment_tokens", {
 id: text("id").primaryKey(),
 token: text("token").notNull().unique(),
 groupId: text("group_id")
 .notNull()
 .references(() => groups.id, { onDelete: "cascade" }),
 capacity: integer("capacity").default(1).notNull(), // Capacity from 1 to 5 people
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// Enrollment Token Courses Join Table (Many-to-Many between Token and Courses)
export const enrollmentTokenCourses = sqliteTable(
 "enrollment_token_courses",
 {
 tokenId: text("token_id")
 .notNull()
 .references(() => enrollmentTokens.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 },
 (table) => [
 index("token_courses_token_idx").on(table.tokenId),
 index("token_courses_course_idx").on(table.courseId),
 ]
);

// Relations definitions
export const groupsRelations = relations(groups, ({ many }) => ({
 members: many(groupMembers),
 tokens: many(enrollmentTokens),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
 group: one(groups, {
 fields: [groupMembers.groupId],
 references: [groups.id],
 }),
 user: one(user, {
 fields: [groupMembers.userId],
 references: [user.id],
 }),
}));

export const enrollmentTokensRelations = relations(enrollmentTokens, ({ one, many }) => ({
 group: one(groups, {
 fields: [enrollmentTokens.groupId],
 references: [groups.id],
 }),
 tokenCourses: many(enrollmentTokenCourses),
}));

export const enrollmentTokenCoursesRelations = relations(enrollmentTokenCourses, ({ one }) => ({
 token: one(enrollmentTokens, {
 fields: [enrollmentTokenCourses.tokenId],
 references: [enrollmentTokens.id],
 }),
 course: one(courses, {
 fields: [enrollmentTokenCourses.courseId],
 references: [courses.id],
 }),
}));

// Tutor Courses Table (Which courses a tutor can teach)
export const tutorCourses = sqliteTable(
 "tutor_courses",
 {
 id: text("id").primaryKey(),
 tutorId: text("tutor_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("tutor_courses_tutor_idx").on(table.tutorId),
 index("tutor_courses_course_idx").on(table.courseId),
 ]
);

// Tutor Slots Table (Weekly empty slots listed by tutors)
export const tutorSlots = sqliteTable(
 "tutor_slots",
 {
 id: text("id").primaryKey(),
 tutorId: text("tutor_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 dayOfWeek: text("day_of_week").notNull(), // 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
 startTime: text("start_time").notNull(), // '09:00'
 endTime: text("end_time").notNull(), // '10:30'
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("tutor_slots_tutor_idx").on(table.tutorId),
 ]
);

// Bookings Table (Appointments chosen by students)
export const bookings = sqliteTable(
 "bookings",
 {
 id: text("id").primaryKey(),
 slotId: text("slot_id")
 .notNull()
 .references(() => tutorSlots.id, { onDelete: "cascade" })
 .unique(), // Ensure first-come first-served (only one booking per slot)
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 groupId: text("group_id")
 .notNull()
 .references(() => groups.id, { onDelete: "cascade" }),
 bookedAt: integer("booked_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("bookings_slot_idx").on(table.slotId),
 index("bookings_student_idx").on(table.studentId),
 index("bookings_group_idx").on(table.groupId),
 ]
);

// Relations for tutorCourses
export const tutorCoursesRelations = relations(tutorCourses, ({ one }) => ({
 tutor: one(user, {
 fields: [tutorCourses.tutorId],
 references: [user.id],
 }),
 course: one(courses, {
 fields: [tutorCourses.courseId],
 references: [courses.id],
 }),
}));

// Relations for tutorSlots
export const tutorSlotsRelations = relations(tutorSlots, ({ one }) => ({
 tutor: one(user, {
 fields: [tutorSlots.tutorId],
 references: [user.id],
 }),
 booking: one(bookings, {
 fields: [tutorSlots.id],
 references: [bookings.slotId],
 }),
}));

// Relations for bookings
export const bookingsRelations = relations(bookings, ({ one }) => ({
 slot: one(tutorSlots, {
 fields: [bookings.slotId],
 references: [tutorSlots.id],
 }),
 student: one(user, {
 fields: [bookings.studentId],
 references: [user.id],
 }),
 course: one(courses, {
 fields: [bookings.courseId],
 references: [courses.id],
 }),
 group: one(groups, {
 fields: [bookings.groupId],
 references: [groups.id],
 }),
}));

// ───────────────────────────────────────────────────────────// Enums for AI domain

// New Enums for Zyx Content Ecosystem (Revision v4 - Frozen)

// A. ai_material_instances ; top-level knowledge asset metadata
export const aiMaterialInstances = sqliteTable(
 "ai_material_instances",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 title: text("title").notNull(),
 sourceType: text("source_type").$type<"markdown" | "json" | "pdf_extraction">().notNull(),
 summary: text("summary").notNull(),
 learningObjectives: text("learning_objectives", { mode: "json" }).$defaultFn(() => []).notNull(),
 keywords: text("keywords", { mode: "json" }).$defaultFn(() => []).notNull(),
 chapterIds: text("chapter_ids", { mode: "json" }).$type<string[]>().$defaultFn(() => []),
 pineconeSyncStatus: text("pinecone_sync_status").default("pending").notNull(),
 lastSyncError: text("last_sync_error"),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("ai_instances_course_idx").on(table.courseId),
 ]
);

// B. ai_material_instance_sections ; groups chunks by subtopic
export const aiMaterialInstanceSections = sqliteTable(
 "ai_material_instance_sections",
 {
 id: text("id").primaryKey(),
 materialInstanceId: text("material_instance_id")
 .notNull()
 .references(() => aiMaterialInstances.id, { onDelete: "cascade" }),
 title: text("title"),
 orderIndex: integer("order_index").notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("ai_sections_instance_idx").on(table.materialInstanceId, table.orderIndex),
 ]
);

// C. ai_material_instance_chunks ; physical text segments synced with Pinecone
export const aiMaterialInstanceChunks = sqliteTable(
 "ai_material_instance_chunks",
 {
 id: text("id").primaryKey(),
 sectionId: text("section_id")
 .notNull()
 .references(() => aiMaterialInstanceSections.id, { onDelete: "cascade" }),
 chunkText: text("chunk_text").notNull(),
 orderIndex: integer("order_index").notNull(),
 pineconeVectorId: text("pinecone_vector_id").notNull(),
 isSynced: integer("is_synced", { mode: "boolean" }).default(false).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_chunks_section").on(table.sectionId, table.orderIndex),
 ]
);

// D. ai_generation_jobs ; tracks background Gemini generation requests
export const aiGenerationJobs = sqliteTable(
 "ai_generation_jobs",
 {
 id: text("id").primaryKey(),
 tutorId: text("tutor_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 status: text("status").$type<"pending" | "processing" | "completed" | "failed">().default("pending").notNull(),
 promptParameters: text("prompt_parameters", { mode: "json" }).notNull(),
 targetCount: integer("target_count").notNull(),
 generatedCount: integer("generated_count").default(0).notNull(),
 tokenUsage: integer("token_usage").default(0).notNull(),
 errorMessage: text("error_message"),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_jobs_status").on(table.courseId, table.status),
 ]
);

// E. ai_question_bank ; permanent, reusable question repository (modified for KO references)
export const aiQuestionBank = sqliteTable(
 "ai_question_bank",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 sourceSectionId: text("source_section_id")
 .references(() => aiMaterialInstanceSections.id, { onDelete: "set null" }),
 
 // Final v4 adjustments
 knowledgeObjectId: text("knowledge_object_id")
 .references(() => knowledgeObjects.id, { onDelete: "set null" }),
 sourceMtdId: text("source_mtd_id")
 .references(() => masterTeachingDocuments.id, { onDelete: "set null" }),
 sourceMtdVersion: integer("source_mtd_version"),
 generationHash: text("generation_hash"),
 status: text("status").default("active").notNull(),
 isStale: integer("is_stale", { mode: "boolean" }).default(false).notNull(),
 
 difficulty: text("difficulty").$type<"easy" | "medium" | "hard">().default("medium").notNull(),
 questionType: text("question_type").$type<"multiple_choice" | "multiple_choices">().default("multiple_choice").notNull(),
 tags: text("tags", { mode: "json" }).$defaultFn(() => []).notNull(),
 prompt: text("prompt").notNull(),
 options: text("options", { mode: "json" }).notNull(),
 correctIndices: text("correct_indices", { mode: "json" }).notNull(),
 /**
 * EIF E1: per non-correct option, the misconception it represents.
 * One entry per wrong option. Empty/null = not tagged (legacy rows).
 */
 distractorMap: text("distractor_map", { mode: "json" })
 .$type<Array<{
 optionIndex: number;
 kind: "misconception" | "calc_error" | "unit_error" | "vocab_swap" | "none";
 misconceptionKoId: string | null;
 label: string;
 }>>()
 .$defaultFn(() => []),
 explanation: text("explanation").notNull(),
 reviewStatus: text("review_status").$type<"generated" | "reviewed" | "published" | "flagged" | "retired">().default("generated").notNull(),
 qualityScore: real("quality_score").default(1.0).notNull(),
 useCount: integer("use_count").default(0).notNull(),
 styledAfterAssessmentObjectId: text("styled_after_assessment_object_id")
 .references(() => assessmentObjects.id, { onDelete: "set null" }),
 pattern: text("pattern"),
 reasoningType: text("reasoning_type"),
 applicationLevel: integer("application_level"),
 estimatedSteps: integer("estimated_steps"),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_qbank_selection").on(table.courseId, table.reviewStatus, table.difficulty, table.useCount),
 index("idx_qbank_tags").on(table.tags),
 index("idx_qbank_ko").on(table.knowledgeObjectId),
 ]
);

// E1. question_option_stats ; aggregate per-option selection counters (distractor analytics)
export const questionOptionStats = sqliteTable(
 "question_option_stats",
 {
 id: text("id").primaryKey(),
 questionId: text("question_id")
 .notNull()
 .references(() => aiQuestionBank.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 optionIndex: integer("option_index").notNull(),
 selectedCount: integer("selected_count").default(0).notNull(),
 totalAttempts: integer("total_attempts").default(0).notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 unique("uq_qos_question_option").on(table.questionId, table.optionIndex),
 index("idx_qos_question").on(table.questionId),
 ]
);

// F. quiz_templates ; publishable quiz configurations with selection rules
export const quizTemplates = sqliteTable(
 "quiz_templates",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 title: text("title").notNull(),
 category: text("category").$type<"daily" | "weekly" | "chapter" | "premium">().notNull(),
 visibility: text("visibility").$type<"free" | "paid">().default("free").notNull(),
 timeLimitSeconds: integer("time_limit_seconds"),
 maxAttempts: integer("max_attempts"),
 selectionRules: text("selection_rules", { mode: "json" }).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_templates_search").on(table.courseId, table.category, table.visibility),
 ]
);

// G. student_quiz_attempts ; user quiz session with deep question snapshots
export const studentQuizAttempts = sqliteTable(
 "student_quiz_attempts",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 templateId: text("template_id")
 .notNull()
 .references(() => quizTemplates.id, { onDelete: "cascade" }),
 score: integer("score"),
 durationSeconds: integer("duration_seconds"),
 status: text("status").$type<"in_progress" | "completed" | "abandoned">().default("in_progress").notNull(),
 questionsSnapshot: text("questions_snapshot", { mode: "json" }).notNull(),
 answersSnapshot: text("answers_snapshot", { mode: "json" }),
 startedAt: integer("started_at", { mode: "timestamp" }).defaultNow().notNull(),
 submittedAt: integer("submitted_at", { mode: "timestamp" }),
 strongAreas: text("strong_areas", { mode: "json" }),
 weakAreas: text("weak_areas", { mode: "json" }),
 recommendedNextSteps: text("recommended_next_steps", { mode: "json" }),
 /** EIF E2: per-concept mastery score snapshot at attempt start, for the before/after delta. */
 masteryBefore: text("mastery_before", { mode: "json" }).$type<Record<string, number>>(),
 },
 (table) => [
 index("idx_attempts_student").on(table.studentId, table.status),
 index("idx_attempts_completed").on(table.templateId, table.score).where(sql`"status" = 'completed'`),
 ]
);

// ─────────────────────────────────────────────────────────────────────────────
// NEW DOMAINS (Revision v4 - Frozen)
// ─────────────────────────────────────────────────────────────────────────────

// 1. chapters
export const chapters = sqliteTable(
 "chapters",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 title: text("title").notNull(),
 description: text("description"),
 orderIndex: integer("order_index").notNull(),
 status: text("status").default("draft").notNull(), // 'draft', 'published'
 assetGenStatus: text("asset_gen_status").default("idle").notNull(), // 'idle', 'generating', 'completed', 'failed'
 assetGenFlashcardsTotal: integer("asset_gen_flashcards_total").default(0).notNull(),
 assetGenFlashcardsCurrent: integer("asset_gen_flashcards_current").default(0).notNull(),
 assetGenQuestionsTotal: integer("asset_gen_questions_total").default(0).notNull(),
 assetGenQuestionsCurrent: integer("asset_gen_questions_current").default(0).notNull(),
 assetGenError: text("asset_gen_error"),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_chapters_course_order").on(table.courseId, table.orderIndex),
 ]
);

// 2. student_chapter_progress
export const studentChapterProgress = sqliteTable(
 "student_chapter_progress",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 chapterId: text("chapter_id")
 .notNull()
 .references(() => chapters.id, { onDelete: "cascade" }),
 unlocked: integer("unlocked", { mode: "boolean" }).default(false).notNull(),
 completed: integer("completed", { mode: "boolean" }).default(false).notNull(),
 completedAt: integer("completed_at", { mode: "timestamp" }),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_student_chap_prog").on(table.studentId, table.chapterId),
 ]
);

// 3. master_teaching_documents
export const masterTeachingDocuments = sqliteTable(
 "master_teaching_documents",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 sourceId: text("source_id")
 .references(() => driveItem.id, { onDelete: "set null" }),
 title: text("title").notNull(),
 markdownContent: text("markdown_content").notNull(),
 originalPdfKey: text("original_pdf_key"),
 canonicalMarkdownKey: text("canonical_markdown_key"),
 version: integer("version").default(1).notNull(),
 status: text("status").default("draft").notNull(), // 'draft', 'active', 'archived'
 type: text("type").$type<"learning" | "assessment">().default("learning").notNull(),
 sourceHash: text("source_hash"),
 derivedHash: text("derived_hash"),
 createdById: text("created_by_id")
 .notNull()
 .references(() => user.id),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 }
);

// 3.5. concepts & concept_localizations
export const concepts = sqliteTable(
 "concepts",
 {
 id: text("id").primaryKey(),
 canonicalSlug: text("canonical_slug").notNull().unique(),
 isVerified: integer("is_verified", { mode: "boolean" }).default(false).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 }
);

export const conceptLocalizations = sqliteTable(
 "concept_localizations",
 {
 id: text("id").primaryKey(),
 conceptId: text("concept_id")
 .notNull()
 .references(() => concepts.id, { onDelete: "cascade" }),
 lang: text("lang").$type<"id" | "en">().notNull(),
 displayName: text("display_name").notNull(),
 aliases: text("aliases", { mode: "json" }).$defaultFn(() => []).notNull(),
 technicalStandardTerm: text("technical_standard_term").$type<"id" | "en">().default("id").notNull(),
 embedding: text("embedding", { mode: "json" }).$type<number[]>(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_concept_loc_concept").on(table.conceptId),
 unique("uq_concept_loc_concept_lang").on(table.conceptId, table.lang),
 ]
);

// 4. knowledge_objects
export const knowledgeObjects = sqliteTable(
 "knowledge_objects",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 mtdId: text("mtd_id")
 .notNull()
 .references(() => masterTeachingDocuments.id, { onDelete: "cascade" }),
 chapterId: text("chapter_id")
 .notNull()
 .references(() => chapters.id, { onDelete: "cascade" }),
 conceptId: text("concept_id")
 .notNull()
 .references(() => concepts.id, { onDelete: "cascade" }),
 learningOrder: integer("learning_order").notNull(),
 title: text("title").notNull(),
 conceptName: text("concept_name").notNull(),
 content: text("content").notNull(), // Markdown + LaTeX
 type: text("type").$type<"definition" | "formula" | "example" | "misconception" | "exercise" | "summary" | "objective" | "concept_overview">().notNull(),
 difficulty: text("difficulty").$type<"easy" | "medium" | "hard">().default("medium").notNull(),
 bloomLevel: text("bloom_level").$type<"remember" | "understand" | "apply" | "analyze" | "evaluate" | "create">().notNull(),
 tags: text("tags", { mode: "json" }).$defaultFn(() => []).notNull(),
 importance: text("importance").$type<"high" | "medium" | "low">().default("medium").notNull(),
 metadata: text("metadata", { mode: "json" }).$defaultFn(() => ({})).notNull(),
 pineconeVectorId: text("pinecone_vector_id"), // Nullable until vector sync succeeds
 status: text("status").$type<"active" | "retired">().default("active").notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_ko_course").on(table.courseId),
 index("idx_ko_chapter").on(table.chapterId),
 index("idx_ko_concept").on(table.conceptId),
 index("idx_ko_status").on(table.status),
 ]
);

// 5. website_materials (Single Material per Chapter, M:N links removed)
export const websiteMaterials = sqliteTable(
 "website_materials",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 chapterId: text("chapter_id")
 .notNull()
 .references(() => chapters.id, { onDelete: "cascade" }),
 sourceMtdId: text("source_mtd_id")
 .notNull()
 .references(() => masterTeachingDocuments.id, { onDelete: "cascade" }),
 sourceMtdVersion: integer("source_mtd_version").notNull(),
 isStale: integer("is_stale", { mode: "boolean" }).default(false).notNull(),
 generationHash: text("generation_hash").notNull(),
 title: text("title").notNull(),
 slug: text("slug").notNull(),
 canonicalMarkdown: text("canonical_markdown").notNull(), // Markdown = editable
 structuredContent: text("structured_content", { mode: "json" }).notNull(), // AST = executable
 /** EIF E3: normalized term -> concept index, built at publish for the interactive material popover. */
 termIndex: text("term_index", { mode: "json" })
 .$type<Array<{ term: string; conceptId: string; conceptName: string }>>(),
 contentVersion: integer("content_version").default(1).notNull(),
 status: text("status").default("draft").notNull(),
 coverageStatus: text("coverage_status")
    .$type<"not_verified" | "fully_covered" | "partially_covered" | "coverage_failed">()
    .default("not_verified")
    .notNull(),
  coverageReport: text("coverage_report", { mode: "json" })
    .$type<{
      totalKOs: number;
      mappedKOs: number;
      missingKOs: Array<{ id: string; title: string; type: string }>;
      formulaFailures: Array<{ koId: string; expected: string; actual: string; reason: string }>;
      issues: string[];
      verifiedAt: string;
    }>()
    .$defaultFn(() => ({
      totalKOs: 0,
      mappedKOs: 0,
      missingKOs: [],
      formulaFailures: [],
      issues: [],
      verifiedAt: ""
    }))
    .notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_web_mat_stale").on(table.isStale),
 index("idx_web_mat_chapter").on(table.chapterId),
 ]
);

// 5b. website_material_versions
export const websiteMaterialVersions = sqliteTable(
 "website_material_versions",
 {
 id: text("id").primaryKey(),
 materialId: text("material_id")
 .notNull()
 .references(() => websiteMaterials.id, { onDelete: "cascade" }),
 versionNumber: integer("version_number").notNull(),
 canonicalMarkdown: text("canonical_markdown").notNull(),
 structuredContent: text("structured_content", { mode: "json" }).notNull(),
 authorId: text("author_id")
 .references(() => user.id, { onDelete: "set null" }),
 changeSummary: text("change_summary"),
 isAiGenerated: integer("is_ai_generated", { mode: "boolean" }).default(false).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_web_mat_ver_mat").on(table.materialId),
 ]
);

// 6. vector_sync_queue (Transactional Outbox)
export const vectorSyncQueue = sqliteTable(
 "vector_sync_queue",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 koId: text("ko_id")
 .references(() => knowledgeObjects.id, { onDelete: "set null" }),
 action: text("action").$type<"upsert" | "delete">().notNull(),
 namespace: text("namespace").default("learning").notNull(),
 payload: text("payload", { mode: "json" }).notNull(),
 status: text("status").$type<"pending" | "processing" | "completed" | "failed">().default("pending").notNull(),
 attempts: integer("attempts").default(0).notNull(),
 lastError: text("last_error"),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_vector_sync_status").on(table.status),
 ]
);

// 7. flashcard_sets
export const flashcardSets = sqliteTable(
 "flashcard_sets",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 chapterId: text("chapter_id")
 .notNull()
 .references(() => chapters.id, { onDelete: "cascade" }),
 sourceMtdId: text("source_mtd_id")
 .notNull()
 .references(() => masterTeachingDocuments.id, { onDelete: "cascade" }),
 sourceMtdVersion: integer("source_mtd_version").notNull(),
 isStale: integer("is_stale", { mode: "boolean" }).default(false).notNull(),
 generationHash: text("generation_hash").notNull(),
 title: text("title").notNull(),
 status: text("status").default("draft").notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 }
);

// 8. flashcards
export const flashcards = sqliteTable(
 "flashcards",
 {
 id: text("id").primaryKey(),
 setId: text("set_id")
 .notNull()
 .references(() => flashcardSets.id, { onDelete: "cascade" }),
 koId: text("ko_id")
 .references(() => knowledgeObjects.id, { onDelete: "set null" }),
 front: text("front").notNull(),
 back: text("back").notNull(),
 explanation: text("explanation"),
 status: text("status").$type<"active" | "retired">().default("active").notNull(),
 metadata: text("metadata", { mode: "json" }).$defaultFn(() => ({})).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 }
);

// 9. student_flashcard_progress
export const studentFlashcardProgress = sqliteTable(
 "student_flashcard_progress",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 flashcardId: text("flashcard_id")
 .notNull()
 .references(() => flashcards.id, { onDelete: "cascade" }),
 easeFactor: real("ease_factor").default(2.5).notNull(),
 intervalDays: integer("interval_days").default(0).notNull(),
 repetitions: integer("repetitions").default(0).notNull(),
 lapses: integer("lapses").default(0).notNull(),
 dueDate: integer("due_date", { mode: "timestamp" }).defaultNow().notNull(),
 lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp" }),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 unique("uq_student_flashcard").on(table.studentId, table.flashcardId),
 index("idx_student_fc_due").on(table.studentId, table.dueDate),
 ]
);

// 9.5. flashcard_reviews
export const flashcardReviews = sqliteTable(
 "flashcard_reviews",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 flashcardId: text("flashcard_id")
 .notNull()
 .references(() => flashcards.id, { onDelete: "cascade" }),
 grade: integer("grade").notNull(), // 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
 responseTimeMs: integer("response_time_ms").notNull(),
 reviewedAt: integer("reviewed_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_fc_reviews_student").on(table.studentId),
 index("idx_fc_reviews_card").on(table.flashcardId),
 ]
);

// 9.6. student_material_progress
export const studentMaterialProgress = sqliteTable(
 "student_material_progress",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 materialId: text("material_id")
 .notNull()
 .references(() => websiteMaterials.id, { onDelete: "cascade" }),
 completionPercent: integer("completion_percent").default(0).notNull(), // range 0-100
 lastSectionId: text("last_section_id"), // Deprecated: use lastPosition instead
 lastPosition: text("last_position", { mode: "json" }).$type<{
   type: "pdf" | "article";
   page?: number;
   section?: string;
 }>(),
 timeSpentSeconds: integer("time_spent_seconds").default(0).notNull(), // accumulative
 lastOpenedAt: integer("last_opened_at", { mode: "timestamp" }).defaultNow().notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 unique("uq_student_material").on(table.studentId, table.materialId),
 index("idx_student_mat_prog").on(table.studentId, table.materialId),
 ]
);

// 10. diktats
export const diktats = sqliteTable(
 "diktats",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 sourceMtdId: text("source_mtd_id")
 .notNull()
 .references(() => masterTeachingDocuments.id, { onDelete: "cascade" }),
 sourceMtdVersion: integer("source_mtd_version").notNull(),
 isStale: integer("is_stale", { mode: "boolean" }).default(false).notNull(),
 generationHash: text("generation_hash").notNull(),
 title: text("title").notNull(),
 fileUrl: text("file_url"),
 chapterIds: text("chapter_ids", { mode: "json" }).notNull(),
 settings: text("settings", { mode: "json" }).$defaultFn(() => ({})).notNull(),
 status: text("status").default("draft").notNull(), // 'draft', 'generating', 'ready', 'failed'
 downloadCount: integer("download_count").default(0).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 }
);

// 11. knowledge_relationships

export const knowledgeRelationships = sqliteTable(
 "knowledge_relationships",
 {
 id: text("id").primaryKey(),
 sourceKoId: text("source_ko_id")
 .notNull()
 .references(() => knowledgeObjects.id, { onDelete: "cascade" }),
 targetKoId: text("target_ko_id")
 .notNull()
 .references(() => knowledgeObjects.id, { onDelete: "cascade" }),
 type: text("type").$type<"prerequisite" | "related" | "extends" | "example_of" | "misconception_of">().notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_rel_source").on(table.sourceKoId),
 index("idx_rel_target").on(table.targetKoId),
 index("idx_rel_source_target_type").on(table.sourceKoId, table.targetKoId, table.type),
 ]
);

// 11.4. assessment_sources
export const assessmentSources = sqliteTable("assessment_sources", {
  id: text("id").primaryKey(),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  origin: text("origin").$type<"uploaded" | "generated">().default("uploaded").notNull(),
  category: text("category").$type<"tutorial" | "quiz" | "uts" | "uas" | "tryout">().notNull(),
  year: integer("year").notNull(),
  semester: integer("semester"),
  sourceMarkdown: text("source_markdown").notNull(),
  sourceHash: text("source_hash").notNull(),
  version: integer("version").default(1).notNull(),
  parserVersion: text("parser_version").default("1.0.0").notNull(),
  ingestionStatus: text("ingestion_status")
    .$type<"pending" | "processing" | "completed" | "failed">()
    .default("pending")
    .notNull(),
  ingestionError: text("ingestion_error"),
  ingestionStartedAt: integer("ingestion_started_at", { mode: "timestamp" }),
  ingestionCompletedAt: integer("ingestion_completed_at", { mode: "timestamp" }),
  originalFilename: text("original_filename"),
  uploadthingKey: text("uploadthing_key"),
  uploadedByUserId: text("uploaded_by_user_id")
    .notNull()
    .references(() => user.id),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  deletedByUserId: text("deleted_by_user_id")
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// 11.4.5. assessment_source_chapters
export const assessmentSourceChapters = sqliteTable(
  "assessment_source_chapters",
  {
    id: text("id").primaryKey(),
    assessmentSourceId: text("assessment_source_id")
      .notNull()
      .references(() => assessmentSources.id, { onDelete: "cascade" }),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_asc_source").on(table.assessmentSourceId),
    index("idx_asc_chapter").on(table.chapterId),
  ]
);

// 11.4.8. chapter_aliases
export const chapterAliases = sqliteTable("chapter_aliases", {
  id: text("id").primaryKey(),
  chapterId: text("chapter_id")
    .notNull()
    .references(() => chapters.id, { onDelete: "cascade" }),
  aliasName: text("alias_name").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
});

// 11.5. assessment_objects
export const assessmentObjects = sqliteTable(
  "assessment_objects",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => assessmentSources.id, { onDelete: "cascade" }),
    questionOrder: integer("question_order").notNull(),
    sourceQuestionNumber: text("source_question_number"),
    questionType: text("question_type").notNull(),
    difficulty: integer("difficulty").notNull(),
    applicationLevel: integer("application_level").notNull(),
    pattern: text("pattern").notNull(),
    reasoningType: text("reasoning_type").notNull(),
    estimatedSteps: integer("estimated_steps").notNull(),
    questionMarkdown: text("question_markdown").default("").notNull(),
    answerMarkdown: text("answer_markdown"),
    options: text("options", { mode: "json" }).$type<string[]>(),
    canonicalQuestionHash: text("canonical_question_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  }
);

// Join table: Assessment Objects to Concepts (Concept-First Mapping)
export const assessmentObjectConcepts = sqliteTable(
  "assessment_object_concepts",
  {
    id: text("id").primaryKey(),
    assessmentObjectId: text("assessment_object_id")
      .notNull()
      .references(() => assessmentObjects.id, { onDelete: "cascade" }),
    conceptId: text("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_ao_concepts_ao").on(table.assessmentObjectId),
    index("idx_ao_concepts_concept").on(table.conceptId),
  ]
);

// Join table: Assessment Objects to specific tested KOs
export const assessmentObjectKos = sqliteTable(
  "assessment_object_kos",
  {
    id: text("id").primaryKey(),
    assessmentObjectId: text("assessment_object_id")
      .notNull()
      .references(() => assessmentObjects.id, { onDelete: "cascade" }),
    koId: text("ko_id")
      .notNull()
      .references(() => knowledgeObjects.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_ao_kos_ao").on(table.assessmentObjectId),
    index("idx_ao_kos_ko").on(table.koId),
  ]
);

// 11.6. assessment_profiles
export const assessmentProfiles = sqliteTable(
  "assessment_profiles",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .unique()
      .references(() => courses.id, { onDelete: "cascade" }),
    applicationLevel: integer("application_level").notNull(),
    difficultyDistribution: text("difficulty_distribution", { mode: "json" })
      .$type<{ easy: number; medium: number; hard: number }>()
      .notNull(),
    commonPatterns: text("common_patterns", { mode: "json" }).$type<string[]>().notNull(),
    topContexts: text("top_contexts", { mode: "json" })
      .$type<{ conceptName: string; percentage: number }[]>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  }
);

// 11.7. course_policies
export const coursePolicies = sqliteTable(
  "course_policies",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .unique()
      .references(() => courses.id, { onDelete: "cascade" }),
    maxApplicationLevel: integer("max_application_level").default(2).notNull(),
    maxEstimatedSteps: integer("max_estimated_steps").default(4).notNull(),
    maxReadingComplexity: integer("max_reading_complexity").default(2).notNull(),
    allowEngineeringTerms: integer("allow_engineering_terms", { mode: "boolean" }).default(true).notNull(),
    forbiddenContexts: text("forbidden_contexts", { mode: "json" }).$type<string[]>().notNull(),
    allowedPatterns: text("allowed_patterns", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  }
);

// 12. course_materials (Uploaded PDF files: Materi Kelas & Contoh Soal)
export const courseMaterials = sqliteTable(
	"course_materials",
	{
		id: text("id").primaryKey(),
		courseId: text("course_id")
			.notNull()
			.references(() => courses.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		type: text("type").$type<"materi_kelas" | "contoh_soal">().notNull(),
		fileUrl: text("file_url").notNull(),
		chapterIds: text("chapter_ids", { mode: "json" }).$type<string[]>().notNull(),
		createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("idx_course_materials_course").on(table.courseId),
	]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const coursesRelations = relations(courses, ({ one, many }) => ({
	courseMaterials: many(courseMaterials),
	assessmentSources: many(assessmentSources),
	assessmentProfile: one(assessmentProfiles, {
		fields: [courses.id],
		references: [assessmentProfiles.courseId],
	}),
	coursePolicy: one(coursePolicies, {
		fields: [courses.id],
		references: [coursePolicies.courseId],
	}),
}));

export const assessmentSourcesRelations = relations(assessmentSources, ({ one, many }) => ({
	course: one(courses, {
		fields: [assessmentSources.courseId],
		references: [courses.id],
	}),
	assessmentObjects: many(assessmentObjects),
	chapters: many(assessmentSourceChapters),
}));

export const assessmentSourceChaptersRelations = relations(assessmentSourceChapters, ({ one }) => ({
	assessmentSource: one(assessmentSources, {
		fields: [assessmentSourceChapters.assessmentSourceId],
		references: [assessmentSources.id],
	}),
	chapter: one(chapters, {
		fields: [assessmentSourceChapters.chapterId],
		references: [chapters.id],
	}),
}));

export const chapterAliasesRelations = relations(chapterAliases, ({ one }) => ({
	chapter: one(chapters, {
		fields: [chapterAliases.chapterId],
		references: [chapters.id],
	}),
}));

export const assessmentObjectsRelations = relations(assessmentObjects, ({ one, many }) => ({
	source: one(assessmentSources, {
		fields: [assessmentObjects.sourceId],
		references: [assessmentSources.id],
	}),
	concepts: many(assessmentObjectConcepts),
}));

export const assessmentObjectConceptsRelations = relations(assessmentObjectConcepts, ({ one }) => ({
	assessmentObject: one(assessmentObjects, {
		fields: [assessmentObjectConcepts.assessmentObjectId],
		references: [assessmentObjects.id],
	}),
	concept: one(concepts, {
		fields: [assessmentObjectConcepts.conceptId],
		references: [concepts.id],
	}),
}));

export const assessmentProfilesRelations = relations(assessmentProfiles, ({ one }) => ({
	course: one(courses, {
		fields: [assessmentProfiles.courseId],
		references: [courses.id],
	}),
}));

export const coursePoliciesRelations = relations(coursePolicies, ({ one }) => ({
	course: one(courses, {
		fields: [coursePolicies.courseId],
		references: [courses.id],
	}),
}));

export const courseMaterialsRelations = relations(courseMaterials, ({ one }) => ({
	course: one(courses, {
		fields: [courseMaterials.courseId],
		references: [courses.id],
	}),
}));

export const aiMaterialInstancesRelations = relations(aiMaterialInstances, ({ one, many }) => ({
 course: one(courses, {
 fields: [aiMaterialInstances.courseId],
 references: [courses.id],
 }),
 sections: many(aiMaterialInstanceSections),
}));

export const aiMaterialInstanceSectionsRelations = relations(aiMaterialInstanceSections, ({ one, many }) => ({
 instance: one(aiMaterialInstances, {
 fields: [aiMaterialInstanceSections.materialInstanceId],
 references: [aiMaterialInstances.id],
 }),
 chunks: many(aiMaterialInstanceChunks),
 questions: many(aiQuestionBank),
}));

export const aiMaterialInstanceChunksRelations = relations(aiMaterialInstanceChunks, ({ one }) => ({
 section: one(aiMaterialInstanceSections, {
 fields: [aiMaterialInstanceChunks.sectionId],
 references: [aiMaterialInstanceSections.id],
 }),
}));

export const aiGenerationJobsRelations = relations(aiGenerationJobs, ({ one }) => ({
 tutor: one(user, {
 fields: [aiGenerationJobs.tutorId],
 references: [user.id],
 }),
 course: one(courses, {
 fields: [aiGenerationJobs.courseId],
 references: [courses.id],
 }),
}));

export const aiQuestionBankRelations = relations(aiQuestionBank, ({ one }) => ({
 course: one(courses, {
 fields: [aiQuestionBank.courseId],
 references: [courses.id],
 }),
 sourceSection: one(aiMaterialInstanceSections, {
 fields: [aiQuestionBank.sourceSectionId],
 references: [aiMaterialInstanceSections.id],
 }),
 knowledgeObject: one(knowledgeObjects, {
 fields: [aiQuestionBank.knowledgeObjectId],
 references: [knowledgeObjects.id],
 }),
 sourceMtd: one(masterTeachingDocuments, {
 fields: [aiQuestionBank.sourceMtdId],
 references: [masterTeachingDocuments.id],
 }),
}));

export const quizTemplatesRelations = relations(quizTemplates, ({ one, many }) => ({
 course: one(courses, {
 fields: [quizTemplates.courseId],
 references: [courses.id],
 }),
 attempts: many(studentQuizAttempts),
}));

export const studentQuizAttemptsRelations = relations(studentQuizAttempts, ({ one }) => ({
 student: one(user, {
 fields: [studentQuizAttempts.studentId],
 references: [user.id],
 }),
 template: one(quizTemplates, {
 fields: [studentQuizAttempts.templateId],
 references: [quizTemplates.id],
 }),
}));

// New domain relations
export const chaptersRelations = relations(chapters, ({ one, many }) => ({
 course: one(courses, {
 fields: [chapters.courseId],
 references: [courses.id],
 }),
 knowledgeObjects: many(knowledgeObjects),
 websiteMaterials: many(websiteMaterials),
 flashcardSets: many(flashcardSets),
 progressions: many(studentChapterProgress),
}));

export const studentChapterProgressRelations = relations(studentChapterProgress, ({ one }) => ({
 student: one(user, {
 fields: [studentChapterProgress.studentId],
 references: [user.id],
 }),
 chapter: one(chapters, {
 fields: [studentChapterProgress.chapterId],
 references: [chapters.id],
 }),
}));

export const masterTeachingDocumentsRelations = relations(masterTeachingDocuments, ({ one, many }) => ({
 course: one(courses, {
 fields: [masterTeachingDocuments.courseId],
 references: [courses.id],
 }),
 knowledgeObjects: many(knowledgeObjects),
 websiteMaterials: many(websiteMaterials),
 flashcardSets: many(flashcardSets),
 diktats: many(diktats),
 questions: many(aiQuestionBank),
}));

export const conceptsRelations = relations(concepts, ({ many }) => ({
 localizations: many(conceptLocalizations),
 knowledgeObjects: many(knowledgeObjects),
}));

export const conceptLocalizationsRelations = relations(conceptLocalizations, ({ one }) => ({
 concept: one(concepts, {
 fields: [conceptLocalizations.conceptId],
 references: [concepts.id],
 }),
}));

export const knowledgeObjectsRelations = relations(knowledgeObjects, ({ one, many }) => ({
 concept: one(concepts, {
 fields: [knowledgeObjects.conceptId],
 references: [concepts.id],
 }),
 course: one(courses, {
 fields: [knowledgeObjects.courseId],
 references: [courses.id],
 }),
 mtd: one(masterTeachingDocuments, {
 fields: [knowledgeObjects.mtdId],
 references: [masterTeachingDocuments.id],
 }),
 chapter: one(chapters, {
 fields: [knowledgeObjects.chapterId],
 references: [chapters.id],
 }),
 flashcards: many(flashcards),
 questions: many(aiQuestionBank),
 syncActions: many(vectorSyncQueue),
}));

export const websiteMaterialsRelations = relations(websiteMaterials, ({ one, many }) => ({
 course: one(courses, {
 fields: [websiteMaterials.courseId],
 references: [courses.id],
 }),
 chapter: one(chapters, {
 fields: [websiteMaterials.chapterId],
 references: [chapters.id],
 }),
 sourceMtd: one(masterTeachingDocuments, {
 fields: [websiteMaterials.sourceMtdId],
 references: [masterTeachingDocuments.id],
 }),
 versions: many(websiteMaterialVersions),
}));

export const websiteMaterialVersionsRelations = relations(websiteMaterialVersions, ({ one }) => ({
 material: one(websiteMaterials, {
 fields: [websiteMaterialVersions.materialId],
 references: [websiteMaterials.id],
 }),
 author: one(user, {
 fields: [websiteMaterialVersions.authorId],
 references: [user.id],
 }),
}));

export const vectorSyncQueueRelations = relations(vectorSyncQueue, ({ one }) => ({
 course: one(courses, {
 fields: [vectorSyncQueue.courseId],
 references: [courses.id],
 }),
 ko: one(knowledgeObjects, {
 fields: [vectorSyncQueue.koId],
 references: [knowledgeObjects.id],
 }),
}));

export const flashcardSetsRelations = relations(flashcardSets, ({ one, many }) => ({
 course: one(courses, {
 fields: [flashcardSets.courseId],
 references: [courses.id],
 }),
 chapter: one(chapters, {
 fields: [flashcardSets.chapterId],
 references: [chapters.id],
 }),
 sourceMtd: one(masterTeachingDocuments, {
 fields: [flashcardSets.sourceMtdId],
 references: [masterTeachingDocuments.id],
 }),
 flashcards: many(flashcards),
}));

export const flashcardsRelations = relations(flashcards, ({ one, many }) => ({
 set: one(flashcardSets, {
 fields: [flashcards.setId],
 references: [flashcardSets.id],
 }),
 ko: one(knowledgeObjects, {
 fields: [flashcards.koId],
 references: [knowledgeObjects.id],
 }),
 progressions: many(studentFlashcardProgress),
}));

export const studentFlashcardProgressRelations = relations(studentFlashcardProgress, ({ one }) => ({
 student: one(user, {
 fields: [studentFlashcardProgress.studentId],
 references: [user.id],
 }),
 flashcard: one(flashcards, {
 fields: [studentFlashcardProgress.flashcardId],
 references: [flashcards.id],
 }),
}));

export const flashcardReviewsRelations = relations(flashcardReviews, ({ one }) => ({
 student: one(user, {
 fields: [flashcardReviews.studentId],
 references: [user.id],
 }),
 flashcard: one(flashcards, {
 fields: [flashcardReviews.flashcardId],
 references: [flashcards.id],
 }),
}));

export const studentMaterialProgressRelations = relations(studentMaterialProgress, ({ one }) => ({
 student: one(user, {
 fields: [studentMaterialProgress.studentId],
 references: [user.id],
 }),
 material: one(websiteMaterials, {
 fields: [studentMaterialProgress.materialId],
 references: [websiteMaterials.id],
 }),
}));

export const diktatsRelations = relations(diktats, ({ one }) => ({
 course: one(courses, {
 fields: [diktats.courseId],
 references: [courses.id],
 }),
 sourceMtd: one(masterTeachingDocuments, {
 fields: [diktats.sourceMtdId],
 references: [masterTeachingDocuments.id],
 }),
}));

export const knowledgeRelationshipsRelations = relations(knowledgeRelationships, ({ one }) => ({
 sourceKo: one(knowledgeObjects, {
 fields: [knowledgeRelationships.sourceKoId],
 references: [knowledgeObjects.id],
 }),
 targetKo: one(knowledgeObjects, {
 fields: [knowledgeRelationships.targetKoId],
 references: [knowledgeObjects.id],
 }),
}));

export const aiUsageEvents = sqliteTable(
 "ai_usage_events",
 {
 id: text("id").primaryKey(),
 userId: text("user_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 feature: text("feature").notNull(), // 'tutor' | 'flashcards' | 'quiz' | 'diktat'
 model: text("model").notNull(), // e.g. 'gemini-3.1-flash-lite' | 'gemma-4-26b'
 tokens: integer("tokens").default(0).notNull(),
 requestType: text("request_type").notNull(), // 'explain_concept' | 'analyze_mistake'
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_usage_user_created").on(table.userId, table.createdAt),
 ]
);

// ─────────────────────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS DOMAIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * user_push_tokens ; FCM device registration tokens per user.
 * One user can have multiple tokens (phone, tablet, laptop).
 * The `token` column is unique to prevent duplicates across users.
 */
export const userPushTokens = sqliteTable(
 "user_push_tokens",
 {
 id: text("id").primaryKey(),
 userId: text("user_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 /** Raw FCM registration token returned by getToken(). Unique across all devices. */
 token: text("token").notNull().unique(),
 /** Human-readable device label (e.g. userAgent substring or "Chrome on Windows"). */
 device: text("device").notNull().default("unknown"),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_push_tokens_user").on(table.userId),
 index("idx_push_tokens_token").on(table.token),
 ]
);

/**
 * notifications ; In-app notification log.
 * Persists every push sent so users can view a notification history.
 */
export const notifications = sqliteTable(
 "notifications",
 {
 id: text("id").primaryKey(),
 userId: text("user_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 title: text("title").notNull(),
 body: text("body").notNull(),
 /** Notification category for client-side filtering and routing. */
 type: text("type")
 .$type<
 | "quiz_published"
 | "flashcard_reminder"
 | "tutor_reminder"
 | "payment_success"
 | "admin_broadcast"
 | "announcement"
 >()
 .notNull(),
 /** Whether the user has read/dismissed this notification. */
 read: integer("read", { mode: "boolean" }).default(false).notNull(),
 /** Arbitrary JSON payload (e.g. quizId, courseId, bookingId). */
 metadata: text("metadata", { mode: "json" }).$defaultFn(() => ({})).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_notifications_user_read").on(table.userId, table.read),
 index("idx_notifications_user_created").on(table.userId, table.createdAt),
 ]
);

// ─── P1A: Mastery Foundation ──────────────────────────────────────────────────

// learning_events ; append-only event log; recompute worker reads this
export const learningEvents = sqliteTable(
 "learning_events",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 conceptName: text("concept_name"),
 koId: text("ko_id").references(() => knowledgeObjects.id, { onDelete: "set null" }),
 eventType: text("event_type")
 .$type<"quiz_answer" | "flashcard_review" | "material_completed" | "tutor_question">()
 .notNull(),
 correctness: real("correctness"),
 weight: real("weight").default(1).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_le_student_course_created").on(table.studentId, table.courseId, table.createdAt),
 index("idx_le_student_concept").on(table.studentId, table.conceptName),
 ]
);

// student_concept_mastery ; one row per (student, course, concept)
export const studentConceptMastery = sqliteTable(
 "student_concept_mastery",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 conceptName: text("concept_name").notNull(),
 masteryScore: integer("mastery_score").notNull(),
 confidence: integer("confidence").notNull(),
 evidenceCount: integer("evidence_count").notNull(),
 trend: text("trend").$type<"improving" | "stable" | "declining">(),
 lastEvidenceAt: integer("last_evidence_at", { mode: "timestamp" }).notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 unique("uq_scm_student_course_concept").on(table.studentId, table.courseId, table.conceptName),
 index("idx_scm_student_course_score").on(table.studentId, table.courseId, table.masteryScore),
 ]
);

// student_concept_mastery_history ; daily snapshots for trend computation (P1B)
export const studentConceptMasteryHistory = sqliteTable(
 "student_concept_mastery_history",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 conceptName: text("concept_name").notNull(),
 masteryScore: integer("mastery_score").notNull(),
 confidence: integer("confidence").notNull(),
 snapshotDate: text("snapshot_date").notNull(), // yyyy-mm-dd
 },
 (table) => [
 unique("uq_scmh_student_concept_date").on(table.studentId, table.conceptName, table.snapshotDate),
 index("idx_scmh_student_course").on(table.studentId, table.courseId),
 ]
);

// ─── P2: Streak + Daily Recommendations ──────────────────────────────────────

export const studentStreaks = sqliteTable("student_streaks", {
 studentId: text("student_id")
 .primaryKey()
 .references(() => user.id, { onDelete: "cascade" }),
 currentStreak: integer("current_streak").default(0).notNull(),
 longestStreak: integer("longest_streak").default(0).notNull(),
 lastActiveDate: text("last_active_date").notNull(), // yyyy-mm-dd (UTC)
});

export const dailyRecommendations = sqliteTable(
 "daily_recommendations",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 date: text("date").notNull(), // yyyy-mm-dd (UTC)
 payload: text("payload", { mode: "json" }).notNull(),
 completedItems: text("completed_items", { mode: "json" })
 .$defaultFn(() => [])
 .notNull(),
 generatedAt: integer("generated_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 unique("uq_daily_rec_student_date").on(table.studentId, table.date),
 index("idx_daily_rec_student").on(table.studentId),
 ]
);

// ─── P3: Tutor session memory ────────────────────────────────────────────────

// tutor_session_summaries ; one row per (student, course), deterministic update after each tutor exchange
export const tutorSessionSummaries = sqliteTable(
  "tutor_session_summaries",
  {
  id: text("id").primaryKey(),
  studentId: text("student_id")
  .notNull()
  .references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id")
  .notNull()
  .references(() => courses.id, { onDelete: "cascade" }),
  askedConcepts: text("asked_concepts", { mode: "json" })
  .$defaultFn(() => [])
  .notNull(),
  questionCount: integer("question_count").default(0).notNull(),
  lastSessionAt: integer("last_session_at", { mode: "timestamp" }).defaultNow().notNull(),
  },
  (table) => [
  unique("uq_tss_student_course").on(table.studentId, table.courseId),
  ]
);

// ─── P3A: Chat Sessions & Sources ────────────────────────────────────────────

// chat_sessions ; groups conversations into named sessions per (student, course)
export const chatSessions = sqliteTable(
  "chat_sessions",
  {
  id: text("id").primaryKey(),
  studentId: text("student_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }).defaultNow().notNull(),
  lastMessageAt: integer("last_message_at", { mode: "timestamp" }).defaultNow().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  },
  (table) => [
    index("idx_chat_sessions_student_course").on(table.studentId, table.courseId),
    index("idx_chat_sessions_last_message").on(table.lastMessageAt),
  ]
);

// tutor_chat_messages ; per-message history, linked to a session
export const tutorChatMessages = sqliteTable(
  "tutor_chat_messages",
  {
  id: text("id").primaryKey(),
  studentId: text("student_id")
  .notNull()
  .references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id")
  .notNull()
  .references(() => courses.id, { onDelete: "cascade" }),
  sessionId: text("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["student", "ai"] }).notNull(),
  content: text("content").notNull(),
  sources: text("sources", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  },
  (table) => [
  index("idx_tcm_student_course").on(table.studentId, table.courseId),
  index("idx_tcm_session").on(table.sessionId),
  index("idx_tcm_created_at").on(table.createdAt),
  ]
);

// chat_message_sources ; tracks which sources were used to generate an AI answer
export const chatMessageSources = sqliteTable(
  "chat_message_sources",
  {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => tutorChatMessages.id, { onDelete: "cascade" }),
  sourceType: text("source_type").$type<
    "knowledge_object" | "website_material" | "flashcard" | "concept" | "assessment_question"
  >().notNull(),
  sourceId: text("source_id").notNull(),
  relevanceScore: real("relevance_score").default(1.0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_cms_message").on(table.messageId),
    index("idx_cms_source").on(table.sourceType, table.sourceId),
  ]
);

// ─── P3A: Chat Sessions & Sources Relations ────────────────────────────────────

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  student: one(user, {
    fields: [chatSessions.studentId],
    references: [user.id],
  }),
  course: one(courses, {
    fields: [chatSessions.courseId],
    references: [courses.id],
  }),
  messages: many(tutorChatMessages),
}));

export const tutorChatMessagesRelations = relations(tutorChatMessages, ({ one, many }) => ({
  student: one(user, {
    fields: [tutorChatMessages.studentId],
    references: [user.id],
  }),
  course: one(courses, {
    fields: [tutorChatMessages.courseId],
    references: [courses.id],
  }),
  session: one(chatSessions, {
    fields: [tutorChatMessages.sessionId],
    references: [chatSessions.id],
  }),
  sources: many(chatMessageSources),
}));

export const chatMessageSourcesRelations = relations(chatMessageSources, ({ one }) => ({
  message: one(tutorChatMessages, {
    fields: [chatMessageSources.messageId],
    references: [tutorChatMessages.id],
  }),
}));

// ─── Push Notifications Relations ─────────────────────────────────────────────

export const studentStreaksRelations = relations(studentStreaks, ({ one }) => ({
 student: one(user, {
 fields: [studentStreaks.studentId],
 references: [user.id],
 }),
}));

export const dailyRecommendationsRelations = relations(dailyRecommendations, ({ one }) => ({
 student: one(user, {
 fields: [dailyRecommendations.studentId],
 references: [user.id],
 }),
}));

export const userPushTokensRelations = relations(userPushTokens, ({ one }) => ({
 user: one(user, {
 fields: [userPushTokens.userId],
 references: [user.id],
 }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
 user: one(user, {
 fields: [notifications.userId],
 references: [user.id],
 }),
}));

// P4: Quiz Feedback + Adaptive Companion Tables
export const attemptFeedback = sqliteTable(
 "attempt_feedback",
 {
 id: text("id").primaryKey(),
 attemptId: text("attempt_id")
 .notNull()
 .references(() => studentQuizAttempts.id, { onDelete: "cascade" }),
 questionIndex: integer("question_index").notNull(),
 payload: text("payload", { mode: "json" }).notNull(),
 },
 (table) => [
 unique("uq_attempt_feedback_question").on(table.attemptId, table.questionIndex),
 ]
);

export const interventions = sqliteTable(
 "interventions",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 conceptName: text("concept_name").notNull(),
 reason: text("reason").notNull(),
 status: text("status")
 .$type<"active" | "dismissed" | "resolved">()
 .default("active")
 .notNull(),
 payload: text("payload", { mode: "json" }).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 resolvedAt: integer("resolved_at", { mode: "timestamp" }),
 },
 (table) => [
 uniqueIndex("uq_active_intervention")
 .on(table.studentId, table.conceptName)
 .where(sql`"status" = 'active'`),
 ]
);

export const attemptFeedbackRelations = relations(attemptFeedback, ({ one }) => ({
 attempt: one(studentQuizAttempts, {
 fields: [attemptFeedback.attemptId],
 references: [studentQuizAttempts.id],
 }),
}));

export const interventionsRelations = relations(interventions, ({ one }) => ({
 student: one(user, {
 fields: [interventions.studentId],
 references: [user.id],
 }),
 course: one(courses, {
 fields: [interventions.courseId],
 references: [courses.id],
 }),
}));

// P5: Personalized Study Paths
export const studyPaths = sqliteTable(
 "study_paths",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 pathJson: text("path_json", { mode: "json" }).notNull(),
 computedAt: integer("computed_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 unique("uq_study_paths_student_course").on(table.studentId, table.courseId),
 index("idx_study_paths_student").on(table.studentId),
 ]
);

export const studyPathsRelations = relations(studyPaths, ({ one }) => ({
 student: one(user, {
 fields: [studyPaths.studentId],
 references: [user.id],
 }),
 course: one(courses, {
 fields: [studyPaths.courseId],
 references: [courses.id],
 }),
}));

// P6B: Course analytics snapshots ; daily pre-computed payloads for fast tutor page loads
export const courseAnalyticsSnapshots = sqliteTable(
 "course_analytics_snapshots",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 date: text("date").notNull(), // yyyy-mm-dd
 payload: text("payload", { mode: "json" }).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 unique("uq_course_snapshot_date").on(table.courseId, table.date),
 index("idx_course_snapshot_lookup").on(table.courseId, table.date),
 ]
);

export const courseAnalyticsSnapshotsRelations = relations(courseAnalyticsSnapshots, ({ one }) => ({
 course: one(courses, {
 fields: [courseAnalyticsSnapshots.courseId],
 references: [courses.id],
 }),
}));

// ─── P9: Live Quiz ────────────────────────────────────────────────────────────

export const liveQuizSessions = sqliteTable(
 "live_quiz_sessions",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 tutorId: text("tutor_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 templateId: text("template_id")
 .references(() => quizTemplates.id, { onDelete: "set null" }),
 code: text("code").notNull().unique(),
 state: text("state")
 .$type<"lobby" | "question" | "reveal" | "ended">()
 .default("lobby")
 .notNull(),
 questionsSnapshot: text("questions_snapshot", { mode: "json" }).notNull(),
 participantCount: integer("participant_count").default(0).notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 endedAt: integer("ended_at", { mode: "timestamp" }),
 },
 (table) => [
 index("idx_live_sessions_code").on(table.code),
 index("idx_live_sessions_course").on(table.courseId),
 ]
);

export const liveQuizResults = sqliteTable(
 "live_quiz_results",
 {
 id: text("id").primaryKey(),
 sessionId: text("session_id")
 .notNull()
 .references(() => liveQuizSessions.id, { onDelete: "cascade" }),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 score: integer("score").default(0).notNull(),
 rank: integer("rank"),
 answersSnapshot: text("answers_snapshot", { mode: "json" }).notNull(),
 completedAt: integer("completed_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_live_results_session").on(table.sessionId),
 index("idx_live_results_student").on(table.studentId),
 unique("uq_live_result_session_student").on(table.sessionId, table.studentId),
 ]
);

export const liveQuizSessionsRelations = relations(liveQuizSessions, ({ one, many }) => ({
 course: one(courses, {
 fields: [liveQuizSessions.courseId],
 references: [courses.id],
 }),
 tutor: one(user, {
 fields: [liveQuizSessions.tutorId],
 references: [user.id],
 }),
 template: one(quizTemplates, {
 fields: [liveQuizSessions.templateId],
 references: [quizTemplates.id],
 }),
 results: many(liveQuizResults),
}));

export const liveQuizResultsRelations = relations(liveQuizResults, ({ one }) => ({
 session: one(liveQuizSessions, {
 fields: [liveQuizResults.sessionId],
 references: [liveQuizSessions.id],
 }),
 student: one(user, {
 fields: [liveQuizResults.studentId],
 references: [user.id],
 }),
 course: one(courses, {
 fields: [liveQuizResults.courseId],
 references: [courses.id],
 }),
}));

// ─── PWR: Weekly Learning Reflection ──────────────────────────────────────────

export const weeklyReflections = sqliteTable(
 "weekly_reflections",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 weekStart: text("week_start").notNull(), // yyyy-mm-dd (Monday)
 payload: text("payload", { mode: "json" }).$type<{
 completed: {
 quizzes: number;
 flashcards: number;
 modules: number;
 };
 masteryGrowth: number;
 mostImproved: string | null;
 streak: {
 currentStreak: number;
 longestStreak: number;
 };
 }>().notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 unique("uq_weekly_ref_student_week").on(table.studentId, table.weekStart),
 index("idx_weekly_ref_student").on(table.studentId),
 ]
);

export const weeklyReflectionsRelations = relations(weeklyReflections, ({ one }) => ({
 student: one(user, {
 fields: [weeklyReflections.studentId],
 references: [user.id],
 }),
}));

export const aiExtractionFailures = sqliteTable(
 "ai_extraction_failures",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .references(() => courses.id, { onDelete: "cascade" }),
 chapterId: text("chapter_id")
 .references(() => chapters.id, { onDelete: "cascade" }),
 step: text("step").$type<"extraction" | "canonicalization" | "validation">().notNull(),
 rawOutput: text("raw_output").notNull(),
 errorMessage: text("error_message").notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_ai_fail_course").on(table.courseId),
 index("idx_ai_fail_chapter").on(table.chapterId),
 ]
);

export const aiExtractionFailuresRelations = relations(aiExtractionFailures, ({ one }) => ({
 course: one(courses, {
 fields: [aiExtractionFailures.courseId],
 references: [courses.id],
 }),
 chapter: one(chapters, {
 fields: [aiExtractionFailures.chapterId],
 references: [chapters.id],
 }),
}));

// ─── EIF E5: concept-level graph rollup (rebuilt on KO publish) ────────────────
export const conceptGraphEdges = sqliteTable(
 "concept_graph_edges",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 sourceConcept: text("source_concept").notNull(),
 targetConcept: text("target_concept").notNull(),
 type: text("type").$type<"prerequisite" | "related">().notNull(),
 },
 (table) => [
 index("idx_cge_course").on(table.courseId),
 unique("uq_cge_edge").on(table.courseId, table.sourceConcept, table.targetConcept, table.type),
 ]
);

export const conceptGraphEdgesRelations = relations(conceptGraphEdges, ({ one }) => ({
 course: one(courses, {
 fields: [conceptGraphEdges.courseId],
 references: [courses.id],
 }),
}));

// student_chapter_mastery ; storing aggregated chapter-level mastery scores and trends
export const studentChapterMastery = sqliteTable(
  "student_chapter_mastery",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    masteryScore: integer("mastery_score").notNull(),
    confidence: real("confidence").notNull(),
    evidenceCount: integer("evidence_count").notNull(),
    trend: text("trend").$type<"improving" | "stable" | "declining">(),
    lastEvidenceAt: integer("last_evidence_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("uq_scm_student_chapter").on(table.studentId, table.chapterId),
    index("idx_scm_student_chapter_course").on(table.studentId, table.courseId),
  ]
);

export const studentChapterMasteryRelations = relations(studentChapterMastery, ({ one }) => ({
  student: one(user, {
    fields: [studentChapterMastery.studentId],
    references: [user.id],
  }),
  course: one(courses, {
    fields: [studentChapterMastery.courseId],
    references: [courses.id],
  }),
  chapter: one(chapters, {
    fields: [studentChapterMastery.chapterId],
    references: [chapters.id],
  }),
}));

// mastery_recompute_queue ; tracking pending recomputations to execute asynchronously
export const masteryRecomputeQueue = sqliteTable(
  "mastery_recompute_queue",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<"pending" | "processing" | "completed" | "failed">()
      .default("pending")
      .notNull(),
    reason: text("reason").notNull(),
    retries: integer("retries").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_mrq_status").on(table.status),
    index("idx_mrq_student_course").on(table.studentId, table.courseId),
  ]
);

export const masteryRecomputeQueueRelations = relations(masteryRecomputeQueue, ({ one }) => ({
  student: one(user, {
    fields: [masteryRecomputeQueue.studentId],
    references: [user.id],
  }),
  course: one(courses, {
    fields: [masteryRecomputeQueue.courseId],
    references: [courses.id],
  }),
}));

// ─── Learning Outcomes: CPL -> CPMK -> Sub-CPMK hierarchy ──────────────────
// Closes the audit's deepest structural gap (docs/audit/00-master-summary.md):
// without this, "curriculum coverage" can only ever mean material-to-KO
// coverage, never accreditation-style outcome coverage.
export const learningOutcomes = sqliteTable(
  "learning_outcomes",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    level: text("level").$type<"cpl" | "cpmk" | "sub_cpmk">().notNull(),
    parentId: text("parent_id").references((): any => learningOutcomes.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // e.g. "CPL-1", "CPMK-1.2", "Sub-CPMK-1.2.1"
    description: text("description").notNull(),
    bloomTarget: text("bloom_target").$type<"remember" | "understand" | "apply" | "analyze" | "evaluate" | "create">(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_learning_outcomes_course").on(table.courseId),
    index("idx_learning_outcomes_parent").on(table.parentId),
    unique("uq_learning_outcomes_course_code").on(table.courseId, table.code),
  ]
);

// Join table: which concepts each outcome (typically a CPMK / Sub-CPMK) is realized by.
// Mirrors the assessmentObjectConcepts pattern so coverage queries can join
// learningOutcomes -> learningOutcomeConcepts -> concepts -> knowledgeObjects/assessmentObjectConcepts
// the same way assessment coverage already works.
export const learningOutcomeConcepts = sqliteTable(
  "learning_outcome_concepts",
  {
    id: text("id").primaryKey(),
    learningOutcomeId: text("learning_outcome_id")
      .notNull()
      .references(() => learningOutcomes.id, { onDelete: "cascade" }),
    conceptId: text("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_lo_concepts_lo").on(table.learningOutcomeId),
    index("idx_lo_concepts_concept").on(table.conceptId),
    unique("uq_lo_concepts").on(table.learningOutcomeId, table.conceptId),
  ]
);

export const learningOutcomesRelations = relations(learningOutcomes, ({ one, many }) => ({
  course: one(courses, {
    fields: [learningOutcomes.courseId],
    references: [courses.id],
  }),
  parent: one(learningOutcomes, {
    fields: [learningOutcomes.parentId],
    references: [learningOutcomes.id],
    relationName: "learningOutcomeParent",
  }),
  children: many(learningOutcomes, { relationName: "learningOutcomeParent" }),
  concepts: many(learningOutcomeConcepts),
}));

export const learningOutcomeConceptsRelations = relations(learningOutcomeConcepts, ({ one }) => ({
  learningOutcome: one(learningOutcomes, {
    fields: [learningOutcomeConcepts.learningOutcomeId],
    references: [learningOutcomes.id],
  }),
  concept: one(concepts, {
    fields: [learningOutcomeConcepts.conceptId],
    references: [concepts.id],
  }),
}));

// ─── Continuous Improvement: deterministic content-quality flags ──────────
// Closes docs/audit/admin-knowledge-infrastructure-audit.md item 7: the data
// needed already existed (questionOptionStats, aiQuestionBank.qualityScore),
// nothing computed into it. Pure SQL aggregation, no AI (AGENT_CONTEXT.md
// zero-AI-for-analytics rule) ; mirrors the aiExtractionFailures observability
// table pattern.
export const contentQualityFlags = sqliteTable(
  "content_quality_flags",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => aiQuestionBank.id, { onDelete: "cascade" }),
    flagType: text("flag_type")
      .$type<"too_easy" | "too_hard" | "dead_distractor">()
      .notNull(),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    sampleSize: integer("sample_size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_cqf_course").on(table.courseId),
    index("idx_cqf_question").on(table.questionId),
    unique("uq_cqf_question_type").on(table.questionId, table.flagType),
  ]
);

export const contentQualityFlagsRelations = relations(contentQualityFlags, ({ one }) => ({
  course: one(courses, {
    fields: [contentQualityFlags.courseId],
    references: [courses.id],
  }),
  question: one(aiQuestionBank, {
    fields: [contentQualityFlags.questionId],
    references: [aiQuestionBank.id],
  }),
}));

// ─── Career-Oriented Learning ───────────────────────────────────────────────
// Closes docs/audit/active-recall-and-exploration-audit.md item 4: net-new
// feature, no existing foundation beyond the prerequisite graph itself.
// Career -> target concept set is admin-curated (not AI-inferred), consistent
// with AGENT_CONTEXT.md's AI-quota philosophy. Ordering reuses the
// prerequisite-graph + topological-sort approach already proven in
// lib/study-path-service.ts, scoped to this target set instead of one course.
export const careerPathTemplates = sqliteTable(
  "career_path_templates",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [unique("uq_career_path_templates_title").on(table.title)]
);

export const careerPathConcepts = sqliteTable(
  "career_path_concepts",
  {
    id: text("id").primaryKey(),
    careerPathTemplateId: text("career_path_template_id")
      .notNull()
      .references(() => careerPathTemplates.id, { onDelete: "cascade" }),
    conceptId: text("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_career_path_concepts_template").on(table.careerPathTemplateId),
    index("idx_career_path_concepts_concept").on(table.conceptId),
    unique("uq_career_path_concepts").on(table.careerPathTemplateId, table.conceptId),
  ]
);

export const careerPathTemplatesRelations = relations(careerPathTemplates, ({ many }) => ({
  concepts: many(careerPathConcepts),
}));

export const careerPathConceptsRelations = relations(careerPathConcepts, ({ one }) => ({
  template: one(careerPathTemplates, {
    fields: [careerPathConcepts.careerPathTemplateId],
    references: [careerPathTemplates.id],
  }),
  concept: one(concepts, {
    fields: [careerPathConcepts.conceptId],
    references: [concepts.id],
  }),
}));

// ─── Tutorial PKA Campaign ──────────────────────────────────────────────────
// Free promotional "Tutorial PKA" course for incoming ITB freshmen, simulating
// the multi-stage Pemetaan Kesiapan Akademik test (Stage 1 -> 2 -> 3 per
// subject; passing an earlier stage skips the rest). Routed off a hardcoded
// course id (see lib/pka-config.ts), not a courses.type discriminator, since
// this is a single seasonal campaign, not a general course category. Gated
// end-to-end behind FEATURE_PKA.

// Static subject/stage -> quiz template mapping, admin/seed-authored.
export const pkaSimulationStages = sqliteTable(
  "pka_simulation_stages",
  {
    id: text("id").primaryKey(),
    subject: text("subject").$type<"matematika" | "fisika" | "kimia">().notNull(),
    stage: integer("stage").notNull(), // 1, 2, or 3
    quizTemplateId: text("quiz_template_id")
      .notNull()
      .references(() => quizTemplates.id, { onDelete: "cascade" }),
    passScoreThreshold: integer("pass_score_threshold").notNull(), // 0-100
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_pka_stages_subject_stage").on(table.subject, table.stage),
  ]
);

// Per-student gating state machine for the simulation.
export const pkaStageProgress = sqliteTable(
  "pka_stage_progress",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    subject: text("subject").$type<"matematika" | "fisika" | "kimia">().notNull(),
    stage: integer("stage").notNull(),
    status: text("status").$type<"locked" | "unlocked" | "completed" | "skipped">().default("locked").notNull(),
    bestScore: integer("best_score"),
    passed: integer("passed", { mode: "boolean" }),
    attemptId: text("attempt_id").references(() => studentQuizAttempts.id, { onDelete: "set null" }),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_pka_progress_student_subject_stage").on(table.studentId, table.subject, table.stage),
  ]
);

// Admin-authored Google Meet review session broadcasts.
export const pkaAnnouncements = sqliteTable("pka_announcements", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  meetLink: text("meet_link").notNull(),
  sessionAt: integer("session_at", { mode: "timestamp" }).notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  recipientCount: integer("recipient_count"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
});

export const pkaSimulationStagesRelations = relations(pkaSimulationStages, ({ one }) => ({
  quizTemplate: one(quizTemplates, {
    fields: [pkaSimulationStages.quizTemplateId],
    references: [quizTemplates.id],
  }),
}));

export const pkaStageProgressRelations = relations(pkaStageProgress, ({ one }) => ({
  student: one(user, {
    fields: [pkaStageProgress.studentId],
    references: [user.id],
  }),
  attempt: one(studentQuizAttempts, {
    fields: [pkaStageProgress.attemptId],
    references: [studentQuizAttempts.id],
  }),
}));

export const pkaAnnouncementsRelations = relations(pkaAnnouncements, ({ one }) => ({
  createdByUser: one(user, {
    fields: [pkaAnnouncements.createdBy],
    references: [user.id],
  }),
}));