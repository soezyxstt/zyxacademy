import { relations, sql } from "drizzle-orm";
import {
 sqliteTable,
 text,
 integer,
 real,
 check,
 index,
 unique,
 uniqueIndex,
  primaryKey,
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

/** Canonical domain identity for a Better Auth user. */
export const pengguna = sqliteTable(
 "pengguna",
 {
  id: text("id")
   .primaryKey()
   .references(() => user.id, { onDelete: "restrict" }),
  status: text("status").$type<"active" | "suspended">().default("active").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [index("pengguna_status_idx").on(table.status)],
);

/** Stable access-role catalog. IDs are seeded by lib/auth/peran.ts and never regenerated. */
export const peran = sqliteTable("peran", {
 id: text("id").primaryKey(),
 code: text("code").$type<"admin" | "tutor" | "murid">().notNull().unique(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
});

/** Independent many-to-many access-role memberships for domain identities. */
export const penggunaPeran = sqliteTable(
 "pengguna_peran",
 {
  id: text("id").primaryKey(),
  penggunaId: text("pengguna_id")
   .notNull()
   .references(() => pengguna.id, { onDelete: "cascade" }),
  peranId: text("peran_id")
   .notNull()
   .references(() => peran.id, { onDelete: "restrict" }),
  source: text("source").notNull(),
  auditActorPenggunaId: text("audit_actor_pengguna_id").references(() => pengguna.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("pengguna_peran_unique_idx").on(table.penggunaId, table.peranId),
  index("pengguna_peran_pengguna_idx").on(table.penggunaId),
  index("pengguna_peran_peran_idx").on(table.peranId),
 ],
);

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

export const userRelations = relations(user, ({ many, one }) => ({
 sessions: many(session),
 accounts: many(account),
 pengguna: one(pengguna, {
  fields: [user.id],
  references: [pengguna.id],
 }),
}));

export const penggunaRelations = relations(pengguna, ({ one, many }) => ({
 user: one(user, {
  fields: [pengguna.id],
  references: [user.id],
 }),
 memberships: many(penggunaPeran),
}));

export const peranRelations = relations(peran, ({ many }) => ({
 memberships: many(penggunaPeran),
}));

export const penggunaPeranRelations = relations(penggunaPeran, ({ one }) => ({
 pengguna: one(pengguna, {
  fields: [penggunaPeran.penggunaId],
  references: [pengguna.id],
 }),
 peran: one(peran, {
  fields: [penggunaPeran.peranId],
  references: [peran.id],
 }),
}));

/** Append-only ledger for guarded staging migrations and reconciliation runs. */
export const migrationRuns = sqliteTable(
 "migration_runs",
 {
  id: text("id").primaryKey(),
  planNumber: text("plan_number").notNull(),
  sourceCommit: text("source_commit").notNull(),
  schemaVersion: text("schema_version").notNull(),
  databaseFingerprint: text("database_fingerprint").notNull(),
  phase: text("phase").notNull(),
  status: text("status").notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }).defaultNow().notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  rowCountManifestHash: text("row_count_manifest_hash"),
  errorCode: text("error_code"),
 },
 (table) => [
  index("migration_runs_plan_idx").on(table.planNumber),
  index("migration_runs_status_idx").on(table.status),
 ],
);

/** Append-only checkpoints emitted by guarded staging commands. */
export const migrationCheckpoints = sqliteTable(
 "migration_checkpoints",
 {
  id: text("id").primaryKey(),
  runId: text("run_id")
   .notNull()
   .references(() => migrationRuns.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(),
  checkpoint: text("checkpoint").notNull(),
  status: text("status").notNull(),
  manifestHash: text("manifest_hash"),
  rowCount: integer("row_count"),
  details: text("details", { mode: "json" }).$type<Record<string, unknown> | null>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  index("migration_checkpoints_run_idx").on(table.runId, table.createdAt),
 ],
);

export const migrationRunsRelations = relations(migrationRuns, ({ many }) => ({
 checkpoints: many(migrationCheckpoints),
}));

export const migrationCheckpointsRelations = relations(migrationCheckpoints, ({ one }) => ({
  run: one(migrationRuns, {
    fields: [migrationCheckpoints.runId],
    references: [migrationRuns.id],
  }),
}));

/**
 * Zero-loss ledger for legacy rows that cannot be represented by the additive
 * domain without inventing data. The source row remains authoritative and the
 * preservation path keeps the compatibility read explicit.
 */
export const legacyBackfillExceptions = sqliteTable(
 "legacy_backfill_exceptions",
 {
  id: text("id").primaryKey(),
  runId: text("run_id")
   .notNull()
   .references(() => migrationRuns.id, { onDelete: "restrict" }),
  legacyTable: text("legacy_table").notNull(),
  legacyId: text("legacy_id").notNull(),
  reasonCode: text("reason_code").notNull(),
  preservationPath: text("preservation_path").notNull(),
  details: text("details", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  blocksCutover: integer("blocks_cutover", { mode: "boolean" }).default(false).notNull(),
  sourceChecksum: text("source_checksum").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [
  uniqueIndex("legacy_backfill_exception_source_idx").on(table.runId, table.legacyTable, table.legacyId, table.reasonCode),
  index("legacy_backfill_exception_run_idx").on(table.runId),
  index("legacy_backfill_exception_blocking_idx").on(table.blocksCutover),
 ],
);

export const legacyBackfillExceptionsRelations = relations(legacyBackfillExceptions, ({ one }) => ({
  run: one(migrationRuns, {
    fields: [legacyBackfillExceptions.runId],
    references: [migrationRuns.id],
  }),
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
  openAt: integer("open_at", { mode: "timestamp" }),
  closeAt: integer("close_at", { mode: "timestamp" }),
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

// E0. question_generation_runs ; audit trail of batch question generation runs
export const questionGenerationRuns = sqliteTable(
  "question_generation_runs",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    blueprintVersion: text("blueprint_version").default("2.0").notNull(),
    promptVersion: text("prompt_version").default("2.0").notNull(),
    sourceVersion: text("source_version"),
    shuffleSeed: integer("shuffle_seed"),
    validatorVersion: text("validator_version").default("2.0").notNull(),
    slotCount: integer("slot_count").default(0).notNull(),
    acceptedCount: integer("accepted_count").default(0).notNull(),
    status: text("status").$type<"completed" | "failed" | "partial" | "processing">().default("completed").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_qgen_runs_course").on(table.courseId),
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
    generationRunId: text("generation_run_id")
      .references(() => questionGenerationRuns.id, { onDelete: "set null" }),
    status: text("status").default("active").notNull(),
    isStale: integer("is_stale", { mode: "boolean" }).default(false).notNull(),

    difficulty: text("difficulty").$type<"easy" | "medium" | "hard">().default("medium").notNull(),
    questionType: text("question_type").$type<"multiple_choice" | "multiple_choices" | "short_answer" | "essay">().default("multiple_choice").notNull(),
    tags: text("tags", { mode: "json" }).$defaultFn(() => []).notNull(),
    prompt: text("prompt").notNull(),
    options: text("options", { mode: "json" }).notNull(),
    correctIndices: text("correct_indices", { mode: "json" }).notNull(),
    acceptableAnswers: text("acceptable_answers", { mode: "json" }).$type<string[]>(),
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
    qualityScore: real("quality_score"),
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
    index("idx_qbank_gen_run").on(table.generationRunId),
  ]
);

// E0.1. distractor_provenance ; machine-readable distractor provenance and misconception mapping
export const distractorProvenance = sqliteTable(
  "distractor_provenance",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => aiQuestionBank.id, { onDelete: "cascade" }),
    optionIndex: integer("option_index").notNull(),
    stableOptionId: text("stable_option_id").notNull(),
    targetedMisconception: text("targeted_misconception").notNull(),
    misconceptionKoId: text("misconception_ko_id")
      .references(() => knowledgeObjects.id, { onDelete: "set null" }),
    supportingSourceIds: text("supporting_source_ids", { mode: "json" }).$defaultFn(() => []).notNull(),
    mappingMethod: text("mapping_method")
      .$type<"exact_ko" | "heuristic_pattern" | "lexical_overlap" | "embedding_similarity" | "manual_override" | "unknown">()
      .default("unknown")
      .notNull(),
    score: real("score").default(0).notNull(),
    methodVersion: text("method_version").default("2.0").notNull(),
    uncertaintyState: text("uncertainty_state")
      .$type<"confident" | "ambiguous" | "unknown">()
      .default("unknown")
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_distractor_prov_option").on(table.questionId, table.optionIndex),
    index("idx_distractor_prov_q").on(table.questionId),
    index("idx_distractor_prov_ko").on(table.misconceptionKoId),
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
    category: text("category").$type<"daily" | "weekly" | "chapter" | "premium" | "simulation">().notNull(),
    visibility: text("visibility").$type<"free" | "paid">().default("free").notNull(),
    status: text("status").$type<"draft" | "published">().default("draft").notNull(),
    timeLimitSeconds: integer("time_limit_seconds"),
    maxAttempts: integer("max_attempts"),
    selectionRules: text("selection_rules", { mode: "json" }).notNull(),
    openAt: integer("open_at", { mode: "timestamp" }),
    closeAt: integer("close_at", { mode: "timestamp" }),
    manualStatus: text("manual_status").$type<"open" | "closed" | "scheduled">().default("scheduled").notNull(),
    showDiscussion: integer("show_discussion", { mode: "boolean" }).default(false).notNull(),
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

export interface QuizAiInsightData {
  summaryOverview: string;
  misconceptions: Array<{
    concept: string;
    description: string;
    frequency: "high" | "medium" | "low";
    targetedQuestions?: string[];
  }>;
  teachingRecommendations: Array<{
    topic: string;
    actionItem: string;
    rationale: string;
  }>;
  hardestQuestionsAnalysis: Array<{
    questionId: string;
    promptSnippet: string;
    accuracyRate: number;
    diagnosis: string;
    distractorTrap: string;
  }>;
  easiestQuestionsAnalysis: Array<{
    questionId: string;
    promptSnippet: string;
    accuracyRate: number;
    reason: string;
  }>;
  actionableNextSteps: string[];
}

export const quizAiInsights = sqliteTable(
  "quiz_ai_insights",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id").references(() => quizTemplates.id, { onDelete: "cascade" }),
    examId: text("exam_id").references(() => exams.id, { onDelete: "cascade" }),
    sampleSize: integer("sample_size").default(0).notNull(),
    insights: text("insights", { mode: "json" }).$type<QuizAiInsightData>().notNull(),
    summary: text("summary"),
    generatedById: text("generated_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_qai_template").on(table.templateId),
    index("idx_qai_exam").on(table.examId),
  ]
);

// H. student_quiz_analytics ; per-attempt detailed deterministic facts and AI pedagogical diagnosis
export const studentQuizAnalytics = sqliteTable(
  "student_quiz_analytics",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .unique()
      .references(() => studentQuizAttempts.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => quizTemplates.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    status: text("status").$type<"processing" | "completed" | "failed">().default("processing").notNull(),
    computedMetrics: text("computed_metrics", { mode: "json" }),
    aiDiagnosis: text("ai_diagnosis", { mode: "json" }),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_sqa_attempt").on(table.attemptId),
    index("idx_sqa_student").on(table.studentId),
    index("idx_sqa_template").on(table.templateId),
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

// Plan 003 canonical source and Idea domain. Legacy course, chapter, enrollment,
// tutor assignment, and knowledge-object tables remain unchanged during expand.
export const mataKuliah = sqliteTable(
 "mata_kuliah",
 {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  status: text("status").$type<"draft" | "active" | "archived">().default("active").notNull(),
  legacyCourseId: text("legacy_course_id").references(() => courses.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [
  uniqueIndex("mata_kuliah_code_idx").on(table.code),
  index("mata_kuliah_legacy_course_idx").on(table.legacyCourseId),
  check("mata_kuliah_status_check", sql`${table.status} IN ('draft', 'active', 'archived')`),
 ],
);

export const bab = sqliteTable(
 "bab",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id")
   .notNull()
   .references(() => mataKuliah.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  title: text("title").notNull(),
  orderIndex: integer("order_index").notNull(),
  status: text("status").$type<"draft" | "active" | "archived">().default("active").notNull(),
  legacyChapterId: text("legacy_chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [
  uniqueIndex("bab_course_code_idx").on(table.mataKuliahId, table.code),
  uniqueIndex("bab_course_order_idx").on(table.mataKuliahId, table.orderIndex),
  index("bab_legacy_chapter_idx").on(table.legacyChapterId),
  check("bab_order_index_check", sql`${table.orderIndex} >= 0`),
  check("bab_status_check", sql`${table.status} IN ('draft', 'active', 'archived')`),
 ],
);

export const pendaftaranMurid = sqliteTable(
 "pendaftaran_murid",
 {
  id: text("id").primaryKey(),
  penggunaId: text("pengguna_id")
   .notNull()
   .references(() => pengguna.id, { onDelete: "restrict" }),
  mataKuliahId: text("mata_kuliah_id")
   .notNull()
   .references(() => mataKuliah.id, { onDelete: "restrict" }),
  status: text("status")
   .$type<"pending" | "active" | "completed" | "cancelled" | "expired">()
   .default("active")
   .notNull(),
  startAt: integer("start_at", { mode: "timestamp" }),
  endAt: integer("end_at", { mode: "timestamp" }),
  legacyEnrollmentId: text("legacy_enrollment_id").references(() => enrollments.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [
  uniqueIndex("pendaftaran_murid_legacy_idx").on(table.legacyEnrollmentId),
  index("pendaftaran_murid_pengguna_idx").on(table.penggunaId),
  index("pendaftaran_murid_mata_kuliah_idx").on(table.mataKuliahId),
  check("pendaftaran_murid_status_check", sql`${table.status} IN ('pending', 'active', 'completed', 'cancelled', 'expired')`),
 ],
);

export const penugasanTutor = sqliteTable(
 "penugasan_tutor",
 {
  id: text("id").primaryKey(),
  penggunaId: text("pengguna_id")
   .notNull()
   .references(() => pengguna.id, { onDelete: "restrict" }),
  mataKuliahId: text("mata_kuliah_id")
   .notNull()
   .references(() => mataKuliah.id, { onDelete: "restrict" }),
  status: text("status")
   .$type<"pending" | "active" | "suspended" | "ended" | "revoked">()
   .default("active")
   .notNull(),
  assignmentScope: text("assignment_scope")
   .$type<"course" | "chapter" | "content">()
   .default("course")
   .notNull(),
  legacyTutorCourseId: text("legacy_tutor_course_id").references(() => tutorCourses.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [
  uniqueIndex("penugasan_tutor_legacy_idx").on(table.legacyTutorCourseId),
  uniqueIndex("penugasan_tutor_scope_idx").on(table.penggunaId, table.mataKuliahId, table.assignmentScope),
  index("penugasan_tutor_pengguna_idx").on(table.penggunaId),
  index("penugasan_tutor_mata_kuliah_idx").on(table.mataKuliahId),
  check("penugasan_tutor_status_check", sql`${table.status} IN ('pending', 'active', 'suspended', 'ended', 'revoked')`),
  check("penugasan_tutor_scope_check", sql`${table.assignmentScope} IN ('course', 'chapter', 'content')`),
 ],
);

export const sumberMateri = sqliteTable(
 "sumber_materi",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id")
   .notNull()
   .references(() => mataKuliah.id, { onDelete: "restrict" }),
  babId: text("bab_id").references(() => bab.id, { onDelete: "set null" }),
  sourceType: text("source_type")
   .$type<"markdown" | "json" | "pdf" | "docx" | "html" | "url" | "transcript" | "tutor_note">()
   .default("markdown")
   .notNull(),
  title: text("title").notNull(),
  canonicalUriOrR2Key: text("canonical_uri_or_r2_key").notNull(),
  version: integer("version").default(1).notNull(),
  checksum: text("checksum").notNull(),
  status: text("status")
   .$type<"draft" | "active" | "withdrawn" | "archived">()
   .default("draft")
   .notNull(),
  creatorId: text("creator_id")
   .notNull()
   .references(() => pengguna.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [
  uniqueIndex("sumber_materi_version_idx").on(table.mataKuliahId, table.canonicalUriOrR2Key, table.version),
  index("sumber_materi_bab_idx").on(table.babId),
  index("sumber_materi_status_idx").on(table.status),
  check("sumber_materi_version_check", sql`${table.version} > 0`),
  check("sumber_materi_source_type_check", sql`${table.sourceType} IN ('markdown', 'json', 'pdf', 'docx', 'html', 'url', 'transcript', 'tutor_note')`),
  check("sumber_materi_status_check", sql`${table.status} IN ('draft', 'active', 'withdrawn', 'archived')`),
 ],
);

export const potonganSumber = sqliteTable(
 "potongan_sumber",
 {
  id: text("id").primaryKey(),
  sumberMateriId: text("sumber_materi_id")
   .notNull()
   .references(() => sumberMateri.id, { onDelete: "cascade" }),
  sourceVersion: integer("source_version").notNull(),
  content: text("content").notNull(),
  pageNumber: integer("page_number"),
  sectionLocator: text("section_locator"),
  startOffset: integer("start_offset").notNull(),
  endOffset: integer("end_offset").notNull(),
  checksum: text("checksum").notNull(),
  embeddingEligible: integer("embedding_eligible", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [
  uniqueIndex("potongan_sumber_span_idx").on(table.sumberMateriId, table.sourceVersion, table.startOffset, table.endOffset),
  index("potongan_sumber_source_idx").on(table.sumberMateriId, table.sourceVersion),
  check("potongan_sumber_version_check", sql`${table.sourceVersion} > 0`),
  check("potongan_sumber_offset_check", sql`${table.startOffset} >= 0 AND ${table.endOffset} > ${table.startOffset}`),
  check("potongan_sumber_page_check", sql`${table.pageNumber} IS NULL OR ${table.pageNumber} > 0`),
 ],
);

export const ide = sqliteTable(
 "ide",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id")
   .notNull()
   .references(() => mataKuliah.id, { onDelete: "restrict" }),
  babId: text("bab_id")
   .notNull()
   .references(() => bab.id, { onDelete: "restrict" }),
  conceptId: text("concept_id").references(() => concepts.id, { onDelete: "set null" }),
  stableKey: text("stable_key").notNull(),
  code: text("code").notNull(),
  canonicalStatement: text("canonical_statement").notNull(),
  conciseExplanation: text("concise_explanation").notNull(),
  latex: text("latex"),
  knowledgeKind: text("knowledge_kind")
   .$type<"definition" | "principle" | "formula" | "procedure" | "example" | "constraint" | "misconception" | "other">()
   .default("other")
   .notNull(),
  instructionalRole: text("instructional_role")
   .$type<"core" | "prerequisite" | "enrichment" | "assessment_support" | "reference">()
   .default("core")
   .notNull(),
  difficultyMetadata: text("difficulty_metadata", { mode: "json" })
   .$type<Record<string, unknown>>()
   .$defaultFn(() => ({}))
   .notNull(),
  version: integer("version").default(1).notNull(),
  status: text("status")
   .$type<"draft" | "published" | "needs_review" | "withdrawn" | "superseded">()
   .default("draft")
   .notNull(),
  sourcePolicy: text("source_policy")
   .$type<"source_grounded" | "tutor_authored">()
   .default("source_grounded")
   .notNull(),
  schemaVersion: text("schema_version").default("1.0").notNull(),
  semanticHash: text("semantic_hash").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id")
   .notNull()
   .references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [
  uniqueIndex("ide_stable_key_idx").on(table.stableKey),
  uniqueIndex("ide_course_code_idx").on(table.mataKuliahId, table.code),
  index("ide_bab_idx").on(table.babId),
  index("ide_concept_idx").on(table.conceptId),
  index("ide_status_idx").on(table.status),
  check("ide_version_check", sql`${table.version} > 0`),
  check("ide_status_check", sql`${table.status} IN ('draft', 'published', 'needs_review', 'withdrawn', 'superseded')`),
  check("ide_source_policy_check", sql`${table.sourcePolicy} IN ('source_grounded', 'tutor_authored')`),
 ],
);

export const asalIde = sqliteTable(
 "asal_ide",
 {
  id: text("id").primaryKey(),
  ideId: text("ide_id")
   .notNull()
   .references(() => ide.id, { onDelete: "cascade" }),
  sourceChunkId: text("source_chunk_id")
   .notNull()
   .references(() => potonganSumber.id, { onDelete: "restrict" }),
  provenanceRole: text("provenance_role")
   .$type<"core" | "supporting" | "prerequisite" | "enrichment" | "assessment_support" | "reference" | "tutor_authored">()
   .default("supporting")
   .notNull(),
  startOffset: integer("start_offset").notNull(),
  endOffset: integer("end_offset").notNull(),
  sourceChecksum: text("source_checksum").notNull(),
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("asal_ide_span_idx").on(table.ideId, table.sourceChunkId, table.startOffset, table.endOffset),
  index("asal_ide_ide_idx").on(table.ideId),
  index("asal_ide_source_idx").on(table.sourceChunkId),
  check("asal_ide_offset_check", sql`${table.startOffset} >= 0 AND ${table.endOffset} > ${table.startOffset}`),
 ],
);

export const relasiIde = sqliteTable(
 "relasi_ide",
 {
  id: text("id").primaryKey(),
  sourceIdeaId: text("source_idea_id")
   .notNull()
   .references(() => ide.id, { onDelete: "cascade" }),
  targetIdeaId: text("target_idea_id")
   .notNull()
   .references(() => ide.id, { onDelete: "cascade" }),
  relationType: text("relation_type")
   .$type<"prerequisite" | "related" | "extends" | "example_of" | "misconception_of">()
   .notNull(),
  explanation: text("explanation"),
  version: integer("version").default(1).notNull(),
  status: text("status").$type<"active" | "superseded" | "withdrawn">().default("active").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [
  uniqueIndex("relasi_ide_unique_idx").on(table.sourceIdeaId, table.targetIdeaId, table.relationType),
  index("relasi_ide_source_idx").on(table.sourceIdeaId),
  index("relasi_ide_target_idx").on(table.targetIdeaId),
  check("relasi_ide_no_self_check", sql`${table.sourceIdeaId} <> ${table.targetIdeaId}`),
  check("relasi_ide_version_check", sql`${table.version} > 0`),
  check("relasi_ide_type_check", sql`${table.relationType} IN ('prerequisite', 'related', 'extends', 'example_of', 'misconception_of')`),
 ],
);

export const ketergantunganProduk = sqliteTable(
 "ketergantungan_produk",
 {
  id: text("id").primaryKey(),
  upstreamEntityType: text("upstream_entity_type").notNull(),
  upstreamEntityId: text("upstream_entity_id").notNull(),
  upstreamVersion: integer("upstream_version").notNull(),
  upstreamHash: text("upstream_hash").notNull(),
  downstreamEntityType: text("downstream_entity_type").notNull(),
  downstreamEntityId: text("downstream_entity_id").notNull(),
  downstreamVersion: integer("downstream_version").notNull(),
  downstreamHash: text("downstream_hash").notNull(),
  freshness: text("freshness")
   .$type<"UP_TO_DATE" | "NEEDS_REVIEW" | "STALE">()
   .default("UP_TO_DATE")
   .notNull(),
  reason: text("reason"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [
  uniqueIndex("ketergantungan_produk_edge_idx").on(table.upstreamEntityType, table.upstreamEntityId, table.downstreamEntityType, table.downstreamEntityId),
  index("ketergantungan_produk_upstream_idx").on(table.upstreamEntityType, table.upstreamEntityId),
  index("ketergantungan_produk_downstream_idx").on(table.downstreamEntityType, table.downstreamEntityId),
  check("ketergantungan_produk_upstream_version_check", sql`${table.upstreamVersion} > 0`),
  check("ketergantungan_produk_downstream_version_check", sql`${table.downstreamVersion} > 0`),
  check("ketergantungan_produk_freshness_check", sql`${table.freshness} IN ('UP_TO_DATE', 'NEEDS_REVIEW', 'STALE')`),
  check("ketergantungan_produk_no_self_check", sql`NOT (${table.upstreamEntityType} = ${table.downstreamEntityType} AND ${table.upstreamEntityId} = ${table.downstreamEntityId})`),
 ],
);

export const petaIdLegacy = sqliteTable(
 "peta_id_legacy",
 {
  id: text("id").primaryKey(),
  legacyTable: text("legacy_table").notNull(),
  legacyId: text("legacy_id").notNull(),
  targetTable: text("target_table").notNull(),
  targetId: text("target_id").notNull(),
  mappingVersion: integer("mapping_version").notNull(),
  sourceChecksum: text("source_checksum").notNull(),
  targetChecksum: text("target_checksum").notNull(),
  runId: text("run_id")
   .notNull()
   .references(() => migrationRuns.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [
  uniqueIndex("peta_id_legacy_source_idx").on(table.legacyTable, table.legacyId),
  uniqueIndex("peta_id_legacy_target_idx").on(table.targetTable, table.targetId),
  index("peta_id_legacy_run_idx").on(table.runId),
  check("peta_id_legacy_mapping_version_check", sql`${table.mappingVersion} > 0`),
 ],
);

// Plan 004 product, assessment, learning-state, bundle, and audit domains.
// These tables are additive; existing product and attempt tables remain intact.
export const artikel = sqliteTable(
 "artikel",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id")
   .notNull()
   .references(() => mataKuliah.id, { onDelete: "restrict" }),
  babId: text("bab_id").references(() => bab.id, { onDelete: "set null" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  contentMarkdown: text("content_markdown").notNull(),
  version: integer("version").default(1).notNull(),
  status: text("status").$type<"draft" | "in_review" | "published" | "withdrawn">().default("draft").notNull(),
  sourceHash: text("source_hash").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("artikel_slug_idx").on(table.slug),
  index("artikel_course_idx").on(table.mataKuliahId),
  index("artikel_chapter_idx").on(table.babId),
  index("artikel_status_version_idx").on(table.status, table.version),
  check("artikel_version_check", sql`${table.version} > 0`),
  check("artikel_status_check", sql`${table.status} IN ('draft', 'in_review', 'published', 'withdrawn')`),
 ],
);

export const artikelIde = sqliteTable(
 "artikel_ide",
 {
  id: text("id").primaryKey(),
  artikelId: text("artikel_id").notNull().references(() => artikel.id, { onDelete: "cascade" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  weight: real("weight").default(1).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("artikel_ide_unique_idx").on(table.artikelId, table.ideId),
  index("artikel_ide_ide_idx").on(table.ideId),
  check("artikel_ide_weight_check", sql`${table.weight} > 0 AND ${table.weight} <= 1`),
 ],
);

export const blokArtikel = sqliteTable(
 "blok_artikel",
 {
  id: text("id").primaryKey(),
  artikelId: text("artikel_id").notNull().references(() => artikel.id, { onDelete: "cascade" }),
  blockKey: text("block_key").notNull(),
  blockType: text("block_type").notNull(),
  orderIndex: integer("order_index").notNull(),
  content: text("content").notNull(),
  version: integer("version").default(1).notNull(),
  generationHash: text("generation_hash").notNull(),
  status: text("status").$type<"draft" | "published" | "withdrawn">().default("draft").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("blok_artikel_order_idx").on(table.artikelId, table.version, table.orderIndex),
  index("blok_artikel_status_idx").on(table.status),
  check("blok_artikel_order_check", sql`${table.orderIndex} >= 0`),
  check("blok_artikel_version_check", sql`${table.version} > 0`),
 ],
);

export const diktatMateri = sqliteTable(
 "diktat_materi",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
  babId: text("bab_id").references(() => bab.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  contentMarkdown: text("content_markdown").notNull(),
  fileKey: text("file_key"),
  version: integer("version").default(1).notNull(),
  status: text("status").$type<"draft" | "in_review" | "published" | "withdrawn">().default("draft").notNull(),
  sourceHash: text("source_hash").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("diktat_materi_course_idx").on(table.mataKuliahId),
  index("diktat_materi_chapter_idx").on(table.babId),
  index("diktat_materi_status_version_idx").on(table.status, table.version),
  check("diktat_materi_version_check", sql`${table.version} > 0`),
  check("diktat_materi_status_check", sql`${table.status} IN ('draft', 'in_review', 'published', 'withdrawn')`),
 ],
);

export const diktatIde = sqliteTable(
 "diktat_ide",
 {
  id: text("id").primaryKey(),
  diktatMateriId: text("diktat_materi_id").notNull().references(() => diktatMateri.id, { onDelete: "cascade" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  weight: real("weight").default(1).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("diktat_ide_unique_idx").on(table.diktatMateriId, table.ideId),
  index("diktat_ide_ide_idx").on(table.ideId),
  check("diktat_ide_weight_check", sql`${table.weight} > 0 AND ${table.weight} <= 1`),
 ],
);

export const soal = sqliteTable(
 "soal",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
  babId: text("bab_id").references(() => bab.id, { onDelete: "set null" }),
  questionType: text("question_type").$type<"multiple_choice" | "multiple_choices" | "short_answer" | "essay">().notNull(),
  prompt: text("prompt").notNull(),
  optionsSnapshot: text("options_snapshot", { mode: "json" }).$type<unknown[]>().$defaultFn(() => []).notNull(),
  version: integer("version").default(1).notNull(),
  status: text("status").$type<"draft" | "in_review" | "published" | "retired">().default("draft").notNull(),
  difficulty: text("difficulty").$type<"easy" | "medium" | "hard">().notNull(),
  cognitiveLevel: text("cognitive_level").$type<"remember" | "understand" | "apply" | "analyze" | "evaluate" | "create">().notNull(),
  reasoningPattern: text("reasoning_pattern").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("soal_course_idx").on(table.mataKuliahId),
  index("soal_chapter_idx").on(table.babId),
  index("soal_status_version_idx").on(table.status, table.version),
  check("soal_version_check", sql`${table.version} > 0`),
  check("soal_status_check", sql`${table.status} IN ('draft', 'in_review', 'published', 'retired')`),
 ],
);

export const soalIde = sqliteTable(
 "soal_ide",
 {
  id: text("id").primaryKey(),
  soalId: text("soal_id").notNull().references(() => soal.id, { onDelete: "cascade" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  weight: real("weight").notNull(),
  role: text("role").$type<"primary" | "supporting" | "required">().default("supporting").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("soal_ide_unique_idx").on(table.soalId, table.ideId),
  index("soal_ide_ide_idx").on(table.ideId),
  check("soal_ide_weight_check", sql`${table.weight} > 0 AND ${table.weight} <= 1`),
 ],
);

export const soalRelasiIde = sqliteTable(
 "soal_relasi_ide",
 {
  id: text("id").primaryKey(),
  soalId: text("soal_id").notNull().references(() => soal.id, { onDelete: "cascade" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  relationType: text("relation_type").$type<"required" | "prerequisite" | "related">().notNull(),
  rationale: text("rationale"),
  status: text("status").$type<"active" | "withdrawn">().default("active").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("soal_relasi_ide_unique_idx").on(table.soalId, table.ideId, table.relationType),
  index("soal_relasi_ide_ide_idx").on(table.ideId),
  check("soal_relasi_ide_type_check", sql`${table.relationType} IN ('required', 'prerequisite', 'related')`),
 ],
);

export const pembahasanSoal = sqliteTable(
 "pembahasan_soal",
 {
  id: text("id").primaryKey(),
  soalId: text("soal_id").notNull().references(() => soal.id, { onDelete: "cascade" }),
  version: integer("version").default(1).notNull(),
  content: text("content").notNull(),
  status: text("status").$type<"draft" | "in_review" | "published" | "retired">().default("draft").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("pembahasan_soal_version_idx").on(table.soalId, table.version),
  check("pembahasan_soal_version_check", sql`${table.version} > 0`),
  check("pembahasan_soal_status_check", sql`${table.status} IN ('draft', 'in_review', 'published', 'retired')`),
 ],
);

export const diktatPembahasan = sqliteTable(
 "diktat_pembahasan",
 {
  id: text("id").primaryKey(),
  diktatMateriId: text("diktat_materi_id").notNull().references(() => diktatMateri.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  version: integer("version").default(1).notNull(),
  status: text("status").$type<"draft" | "in_review" | "published" | "retired">().default("draft").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("diktat_pembahasan_diktat_idx").on(table.diktatMateriId),
  check("diktat_pembahasan_version_check", sql`${table.version} > 0`),
  check("diktat_pembahasan_status_check", sql`${table.status} IN ('draft', 'in_review', 'published', 'retired')`),
 ],
);

export const itemDiktatPembahasan = sqliteTable(
 "item_diktat_pembahasan",
 {
  id: text("id").primaryKey(),
  diktatPembahasanId: text("diktat_pembahasan_id").notNull().references(() => diktatPembahasan.id, { onDelete: "cascade" }),
  soalId: text("soal_id").notNull().references(() => soal.id, { onDelete: "restrict" }),
  orderIndex: integer("order_index").notNull(),
  contentSnapshot: text("content_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("item_diktat_pembahasan_order_idx").on(table.diktatPembahasanId, table.orderIndex),
  uniqueIndex("item_diktat_pembahasan_soal_idx").on(table.diktatPembahasanId, table.soalId),
  check("item_diktat_pembahasan_order_check", sql`${table.orderIndex} >= 0`),
 ],
);

export const soalItbReferensi = sqliteTable(
 "soal_itb_referensi",
 {
  id: text("id").primaryKey(),
  soalId: text("soal_id").references(() => soal.id, { onDelete: "set null" }),
  sourceLabel: text("source_label").notNull(),
  authoringVisibility: text("authoring_visibility").$type<"allowed" | "holdout">().notNull(),
  contentSnapshot: text("content_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  checksum: text("checksum").notNull(),
  version: integer("version").default(1).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("soal_itb_referensi_checksum_idx").on(table.checksum),
  index("soal_itb_referensi_visibility_idx").on(table.authoringVisibility),
  check("soal_itb_referensi_visibility_check", sql`${table.authoringVisibility} IN ('allowed', 'holdout')`),
  check("soal_itb_referensi_version_check", sql`${table.version} > 0`),
 ],
);

export const benchmarkSoal = sqliteTable(
 "benchmark_soal",
 {
  id: text("id").primaryKey(),
  soalItbReferensiId: text("soal_itb_referensi_id").references(() => soalItbReferensi.id, { onDelete: "set null" }),
  datasetKey: text("dataset_key").notNull(),
  authoringVisibility: text("authoring_visibility").$type<"allowed" | "holdout">().notNull(),
  questionSnapshot: text("question_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  answerSnapshot: text("answer_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  version: integer("version").default(1).notNull(),
  checksum: text("checksum").notNull(),
  status: text("status").$type<"active" | "retired">().default("active").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("benchmark_soal_checksum_idx").on(table.checksum),
  index("benchmark_soal_dataset_idx").on(table.datasetKey),
  check("benchmark_soal_visibility_check", sql`${table.authoringVisibility} IN ('allowed', 'holdout')`),
  check("benchmark_soal_version_check", sql`${table.version} > 0`),
 ],
);

export const setFlashcard = sqliteTable(
 "set_flashcard",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
  babId: text("bab_id").references(() => bab.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  version: integer("version").default(1).notNull(),
  status: text("status").$type<"draft" | "in_review" | "published" | "retired">().default("draft").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("set_flashcard_course_idx").on(table.mataKuliahId),
  index("set_flashcard_chapter_idx").on(table.babId),
  index("set_flashcard_status_version_idx").on(table.status, table.version),
  check("set_flashcard_version_check", sql`${table.version} > 0`),
  check("set_flashcard_status_check", sql`${table.status} IN ('draft', 'in_review', 'published', 'retired')`),
 ],
);

export const flashcard = sqliteTable(
 "flashcard",
 {
  id: text("id").primaryKey(),
  setFlashcardId: text("set_flashcard_id").notNull().references(() => setFlashcard.id, { onDelete: "cascade" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  explanation: text("explanation"),
  version: integer("version").default(1).notNull(),
  status: text("status").$type<"draft" | "published" | "retired">().default("draft").notNull(),
  generationHash: text("generation_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("flashcard_set_idx").on(table.setFlashcardId),
  index("flashcard_status_version_idx").on(table.status, table.version),
  check("flashcard_version_check", sql`${table.version} > 0`),
 ],
);

export const flashcardIde = sqliteTable(
 "flashcard_ide",
 {
  id: text("id").primaryKey(),
  flashcardId: text("flashcard_id").notNull().references(() => flashcard.id, { onDelete: "cascade" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  weight: real("weight").default(1).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("flashcard_ide_unique_idx").on(table.flashcardId, table.ideId),
  index("flashcard_ide_ide_idx").on(table.ideId),
  check("flashcard_ide_weight_check", sql`${table.weight} > 0 AND ${table.weight} <= 1`),
 ],
);

export const kemajuanFlashcardMurid = sqliteTable(
 "kemajuan_flashcard_murid",
 {
  id: text("id").primaryKey(),
  penggunaId: text("pengguna_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  flashcardId: text("flashcard_id").notNull().references(() => flashcard.id, { onDelete: "restrict" }),
  dueAt: integer("due_at", { mode: "timestamp" }).notNull(),
  intervalDays: real("interval_days").default(0).notNull(),
  easeFactor: real("ease_factor").default(2.5).notNull(),
  repetitions: integer("repetitions").default(0).notNull(),
  lapses: integer("lapses").default(0).notNull(),
  lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp" }),
  status: text("status").$type<"active" | "suspended" | "completed">().default("active").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("kemajuan_flashcard_murid_unique_idx").on(table.penggunaId, table.flashcardId),
  index("kemajuan_flashcard_murid_due_idx").on(table.penggunaId, table.dueAt),
  check("kemajuan_flashcard_murid_interval_check", sql`${table.intervalDays} >= 0`),
  check("kemajuan_flashcard_murid_ease_check", sql`${table.easeFactor} > 0`),
 ],
);

export const reviewFlashcard = sqliteTable(
 "review_flashcard",
 {
  id: text("id").primaryKey(),
  kemajuanFlashcardMuridId: text("kemajuan_flashcard_murid_id").notNull().references(() => kemajuanFlashcardMurid.id, { onDelete: "restrict" }),
  grade: integer("grade").notNull(),
  responseMs: integer("response_ms"),
  previousDueAt: integer("previous_due_at", { mode: "timestamp" }).notNull(),
  nextDueAt: integer("next_due_at", { mode: "timestamp" }).notNull(),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  index("review_flashcard_progress_idx").on(table.kemajuanFlashcardMuridId, table.reviewedAt),
  check("review_flashcard_grade_check", sql`${table.grade} >= 0 AND ${table.grade} <= 5`),
  check("review_flashcard_response_check", sql`${table.responseMs} IS NULL OR ${table.responseMs} >= 0`),
 ],
);

export const blueprintAsesmen = sqliteTable(
 "blueprint_asesmen",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  assessmentType: text("assessment_type").$type<"quiz" | "tryout">().notNull(),
  blueprint: text("blueprint", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  version: integer("version").default(1).notNull(),
  status: text("status").$type<"draft" | "approved" | "retired">().default("draft").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("blueprint_asesmen_course_idx").on(table.mataKuliahId),
  index("blueprint_asesmen_status_version_idx").on(table.status, table.version),
  check("blueprint_asesmen_version_check", sql`${table.version} > 0`),
  check("blueprint_asesmen_type_check", sql`${table.assessmentType} IN ('quiz', 'tryout')`),
 ],
);

export const asesmen = sqliteTable(
 "asesmen",
 {
  id: text("id").primaryKey(),
  blueprintAsesmenId: text("blueprint_asesmen_id").notNull().references(() => blueprintAsesmen.id, { onDelete: "restrict" }),
  mataKuliahId: text("mata_kuliah_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  assessmentType: text("assessment_type").$type<"quiz" | "tryout">().notNull(),
  version: integer("version").default(1).notNull(),
  status: text("status").$type<"draft" | "published" | "ended" | "retired">().default("draft").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("asesmen_course_idx").on(table.mataKuliahId),
  index("asesmen_status_version_idx").on(table.status, table.version),
  check("asesmen_version_check", sql`${table.version} > 0`),
  check("asesmen_type_check", sql`${table.assessmentType} IN ('quiz', 'tryout')`),
 ],
);

export const cakupanAsesmen = sqliteTable(
 "cakupan_asesmen",
 {
  id: text("id").primaryKey(),
  asesmenId: text("asesmen_id").notNull().references(() => asesmen.id, { onDelete: "cascade" }),
  babId: text("bab_id").notNull().references(() => bab.id, { onDelete: "restrict" }),
  orderIndex: integer("order_index").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("cakupan_asesmen_chapter_idx").on(table.asesmenId, table.babId),
  uniqueIndex("cakupan_asesmen_order_idx").on(table.asesmenId, table.orderIndex),
  check("cakupan_asesmen_order_check", sql`${table.orderIndex} >= 0`),
 ],
);

export const itemAsesmen = sqliteTable(
 "item_asesmen",
 {
  id: text("id").primaryKey(),
  asesmenId: text("asesmen_id").notNull().references(() => asesmen.id, { onDelete: "cascade" }),
  soalId: text("soal_id").notNull().references(() => soal.id, { onDelete: "restrict" }),
  orderIndex: integer("order_index").notNull(),
  renderedQuestionSnapshot: text("rendered_question_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  optionOrderSnapshot: text("option_order_snapshot", { mode: "json" }).$type<string[]>().notNull(),
  gradingPolicySnapshot: text("grading_policy_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  contentVersion: integer("content_version").notNull(),
  generationHash: text("generation_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("item_asesmen_order_idx").on(table.asesmenId, table.orderIndex),
  uniqueIndex("item_asesmen_soal_idx").on(table.asesmenId, table.soalId),
  check("item_asesmen_order_check", sql`${table.orderIndex} >= 0`),
  check("item_asesmen_content_version_check", sql`${table.contentVersion} > 0`),
 ],
);

export const percobaanAsesmen = sqliteTable(
 "percobaan_asesmen",
 {
  id: text("id").primaryKey(),
  asesmenId: text("asesmen_id").notNull().references(() => asesmen.id, { onDelete: "restrict" }),
  penggunaId: text("pengguna_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  status: text("status").$type<"in_progress" | "submitted" | "graded" | "cancelled">().default("in_progress").notNull(),
  renderedQuestionSnapshot: text("rendered_question_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  optionOrderSnapshot: text("option_order_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  gradingPolicySnapshot: text("grading_policy_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  contentVersion: integer("content_version").notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }).defaultNow().notNull(),
  submittedAt: integer("submitted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  index("percobaan_asesmen_murid_idx").on(table.penggunaId, table.createdAt),
  index("percobaan_asesmen_assessment_idx").on(table.asesmenId, table.status),
  check("percobaan_asesmen_content_version_check", sql`${table.contentVersion} > 0`),
 ],
);

export const jawabanMurid = sqliteTable(
 "jawaban_murid",
 {
  id: text("id").primaryKey(),
  percobaanAsesmenId: text("percobaan_asesmen_id").notNull().references(() => percobaanAsesmen.id, { onDelete: "restrict" }),
  itemAsesmenId: text("item_asesmen_id").notNull().references(() => itemAsesmen.id, { onDelete: "restrict" }),
  renderedQuestionSnapshot: text("rendered_question_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  optionOrderSnapshot: text("option_order_snapshot", { mode: "json" }).$type<string[]>().notNull(),
  responseSnapshot: text("response_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  gradingPolicySnapshot: text("grading_policy_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  contentVersion: integer("content_version").notNull(),
  score: real("score"),
  status: text("status").$type<"ungraded" | "correct" | "incorrect" | "partial" | "needs_review">().default("ungraded").notNull(),
  answeredAt: integer("answered_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("jawaban_murid_attempt_item_idx").on(table.percobaanAsesmenId, table.itemAsesmenId),
  index("jawaban_murid_status_idx").on(table.status),
  check("jawaban_murid_content_version_check", sql`${table.contentVersion} > 0`),
 ],
);

export const buktiIdeJawaban = sqliteTable(
 "bukti_ide_jawaban",
 {
  id: text("id").primaryKey(),
  jawabanMuridId: text("jawaban_murid_id").notNull().references(() => jawabanMurid.id, { onDelete: "restrict" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  scoreContribution: real("score_contribution").notNull(),
  weight: real("weight").notNull(),
  confidence: integer("confidence").notNull(),
  evidenceSource: text("evidence_source").notNull(),
  rubricVersion: text("rubric_version").notNull(),
  derivationStatus: text("derivation_status").$type<"deterministic" | "reviewed" | "ambiguous" | "rejected">().notNull(),
  ambiguous: integer("ambiguous", { mode: "boolean" }).default(false).notNull(),
  affectsMastery: integer("affects_mastery", { mode: "boolean" }).default(false).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("bukti_ide_jawaban_unique_idx").on(table.jawabanMuridId, table.ideId),
  index("bukti_ide_jawaban_ide_idx").on(table.ideId),
   check("bukti_ide_jawaban_weight_check", sql`${table.weight} > 0 AND ${table.weight} <= 1`),
   check("bukti_ide_jawaban_confidence_check", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
   check("bukti_ide_jawaban_ambiguous_mastery_check", sql`NOT (${table.ambiguous} AND ${table.affectsMastery})`),
 ],
);

export const buktiPembelajaran = sqliteTable(
 "bukti_pembelajaran",
 {
  id: text("id").primaryKey(),
  penggunaId: text("pengguna_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  evidenceSource: text("evidence_source").notNull(),
  sourceId: text("source_id").notNull(),
  scoreContribution: real("score_contribution").notNull(),
  confidence: integer("confidence").notNull(),
  rubricVersion: text("rubric_version").notNull(),
  derivationStatus: text("derivation_status").$type<"deterministic" | "reviewed" | "ambiguous" | "rejected">().notNull(),
  ambiguous: integer("ambiguous", { mode: "boolean" }).default(false).notNull(),
  affectsMastery: integer("affects_mastery", { mode: "boolean" }).default(false).notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  index("bukti_pembelajaran_murid_ide_idx").on(table.penggunaId, table.ideId),
   index("bukti_pembelajaran_source_idx").on(table.evidenceSource, table.sourceId),
   check("bukti_pembelajaran_confidence_check", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
   check("bukti_pembelajaran_ambiguous_mastery_check", sql`NOT (${table.ambiguous} AND ${table.affectsMastery})`),
 ],
);

export const pemahamanIde = sqliteTable(
 "pemahaman_ide",
 {
  id: text("id").primaryKey(),
  penggunaId: text("pengguna_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  skor: integer("skor").notNull(),
  keyakinan: integer("keyakinan").notNull(),
  evidenceCount: integer("evidence_count").default(0).notNull(),
  version: integer("version").default(1).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("pemahaman_ide_murid_ide_idx").on(table.penggunaId, table.ideId),
  index("pemahaman_ide_ide_idx").on(table.ideId),
  check("pemahaman_ide_score_check", sql`${table.skor} >= 0 AND ${table.skor} <= 100`),
  check("pemahaman_ide_confidence_check", sql`${table.keyakinan} >= 0 AND ${table.keyakinan} <= 100`),
  check("pemahaman_ide_evidence_check", sql`${table.evidenceCount} >= 0`),
  check("pemahaman_ide_version_check", sql`${table.version} > 0`),
 ],
);

export const perubahanPemahaman = sqliteTable(
 "perubahan_pemahaman",
 {
  id: text("id").primaryKey(),
  pemahamanIdeId: text("pemahaman_ide_id").notNull().references(() => pemahamanIde.id, { onDelete: "restrict" }),
  evidenceId: text("evidence_id").references(() => buktiPembelajaran.id, { onDelete: "set null" }),
  previousScore: integer("previous_score").notNull(),
  nextScore: integer("next_score").notNull(),
  previousConfidence: integer("previous_confidence").notNull(),
  nextConfidence: integer("next_confidence").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  index("perubahan_pemahaman_ide_idx").on(table.pemahamanIdeId, table.createdAt),
  check("perubahan_pemahaman_score_check", sql`${table.previousScore} >= 0 AND ${table.previousScore} <= 100 AND ${table.nextScore} >= 0 AND ${table.nextScore} <= 100`),
  check("perubahan_pemahaman_confidence_check", sql`${table.previousConfidence} >= 0 AND ${table.previousConfidence} <= 100 AND ${table.nextConfidence} >= 0 AND ${table.nextConfidence} <= 100`),
 ],
);

export const rekomendasiFlashcard = sqliteTable(
 "rekomendasi_flashcard",
 {
  id: text("id").primaryKey(),
  penggunaId: text("pengguna_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  flashcardId: text("flashcard_id").notNull().references(() => flashcard.id, { onDelete: "restrict" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  dueAt: integer("due_at", { mode: "timestamp" }).notNull(),
  reason: text("reason").notNull(),
  status: text("status").$type<"pending" | "accepted" | "dismissed" | "completed">().default("pending").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("rekomendasi_flashcard_unique_idx").on(table.penggunaId, table.flashcardId, table.dueAt),
  index("rekomendasi_flashcard_due_idx").on(table.penggunaId, table.dueAt),
 ],
);

export const imporBundle = sqliteTable(
 "impor_bundle",
 {
  id: text("id").primaryKey(),
  bundleId: text("bundle_id").notNull(),
  checksum: text("checksum").notNull(),
  bundleType: text("bundle_type").$type<"idea" | "product" | "assessment" | "mixed">().notNull(),
  sourceUriOrKey: text("source_uri_or_key").notNull(),
  version: integer("version").default(1).notNull(),
  status: text("status").$type<"received" | "validated" | "rejected" | "approved" | "published">().default("received").notNull(),
  requestedBy: text("requested_by").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("impor_bundle_identity_idx").on(table.bundleId, table.checksum),
  index("impor_bundle_status_idx").on(table.status),
  check("impor_bundle_version_check", sql`${table.version} > 0`),
 ],
);

export const itemImporBundle = sqliteTable(
 "item_impor_bundle",
 {
  id: text("id").primaryKey(),
  imporBundleId: text("impor_bundle_id").notNull().references(() => imporBundle.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  entityVersion: integer("entity_version").notNull(),
  entityHash: text("entity_hash").notNull(),
  status: text("status").$type<"pending" | "validated" | "rejected" | "published">().default("pending").notNull(),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("item_impor_bundle_entity_idx").on(table.imporBundleId, table.entityType, table.entityId, table.entityVersion),
  index("item_impor_bundle_status_idx").on(table.status),
  check("item_impor_bundle_version_check", sql`${table.entityVersion} > 0`),
 ],
);

export const reviewBundle = sqliteTable(
 "review_bundle",
 {
  id: text("id").primaryKey(),
  imporBundleId: text("impor_bundle_id").notNull().references(() => imporBundle.id, { onDelete: "restrict" }),
  reviewerId: text("reviewer_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  status: text("status").$type<"pending" | "approved" | "rejected">().default("pending").notNull(),
  notes: text("notes"),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("review_bundle_reviewer_idx").on(table.imporBundleId, table.reviewerId),
  index("review_bundle_status_idx").on(table.status),
 ],
);

export const publikasiBundle = sqliteTable(
 "publikasi_bundle",
 {
  id: text("id").primaryKey(),
  imporBundleId: text("impor_bundle_id").notNull().references(() => imporBundle.id, { onDelete: "restrict" }),
  approvedReviewId: text("approved_review_id").notNull().references(() => reviewBundle.id, { onDelete: "restrict" }),
  version: integer("version").default(1).notNull(),
  publicationHash: text("publication_hash").notNull(),
  status: text("status").$type<"pending" | "published" | "withdrawn">().default("pending").notNull(),
  publishedBy: text("published_by").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("publikasi_bundle_version_idx").on(table.imporBundleId, table.version),
  index("publikasi_bundle_status_idx").on(table.status),
  check("publikasi_bundle_version_check", sql`${table.version} > 0`),
 ],
);

export const auditMutasi = sqliteTable(
 "audit_mutasi",
 {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => pengguna.id, { onDelete: "set null" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  beforeSnapshot: text("before_snapshot", { mode: "json" }).$type<Record<string, unknown> | null>(),
  afterSnapshot: text("after_snapshot", { mode: "json" }).$type<Record<string, unknown> | null>(),
  correlationId: text("correlation_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
  index("audit_mutasi_entity_idx").on(table.entityType, table.entityId, table.createdAt),
  index("audit_mutasi_actor_idx").on(table.actorId, table.createdAt),
 ],
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
 status: text("status").$type<"active" | "retired" | "superseded" | "needs_review">().default("active").notNull(),
 stableKey: text("stable_key"),
 semanticHash: text("semantic_hash"),
 version: integer("version").default(1).notNull(),
 knowledgeKind: text("knowledge_kind").$type<"definition" | "principle" | "formula" | "procedure" | "example" | "constraint" | "misconception" | "other">().default("other").notNull(),
 instructionalRole: text("instructional_role").$type<"core" | "prerequisite" | "enrichment" | "assessment_support" | "reference">().default("core").notNull(),
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
 index("idx_ko_stable_key").on(table.stableKey),
 ]
);

// 4b. extraction_runs
export const extractionRuns = sqliteTable(
 "extraction_runs",
 {
 id: text("id").primaryKey(),
 mtdId: text("mtd_id")
 .notNull()
 .references(() => masterTeachingDocuments.id, { onDelete: "cascade" }),
 chapterId: text("chapter_id")
 .notNull()
 .references(() => chapters.id, { onDelete: "cascade" }),
 state: text("state").$type<"staged" | "accepted" | "needs_review" | "failed" | "superseded">().default("staged").notNull(),
 createdBy: text("created_by"),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_extraction_runs_chapter").on(table.chapterId),
 index("idx_extraction_runs_state").on(table.state),
 ]
);

// 4c. knowledge_object_sources
export const knowledgeObjectSources = sqliteTable(
 "knowledge_object_sources",
 {
 id: text("id").primaryKey(),
 koId: text("ko_id")
 .notNull()
 .references(() => knowledgeObjects.id, { onDelete: "cascade" }),
 sourceDocumentId: text("source_document_id").notNull(),
 sourceVersion: text("source_version").default("1.0").notNull(),
 chapterId: text("chapter_id").notNull(),
 startOffset: integer("start_offset").notNull(),
 endOffset: integer("end_offset").notNull(),
 sourceHash: text("source_hash").notNull(),
 excerptHash: text("excerpt_hash").notNull(),
 extractionRunId: text("extraction_run_id").references(() => extractionRuns.id, { onDelete: "set null" }),
 supportRole: text("support_role").$type<"core" | "prerequisite" | "enrichment" | "assessment_support" | "reference">().default("core").notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_ko_sources_ko").on(table.koId),
 index("idx_ko_sources_doc_chapter").on(table.sourceDocumentId, table.chapterId),
 ]
);

// 4d. learning_objectives
export const learningObjectives = sqliteTable(
 "learning_objectives",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 chapterId: text("chapter_id")
 .notNull()
 .references(() => chapters.id, { onDelete: "cascade" }),
 objectiveText: text("objective_text").notNull(),
 bloomLevel: text("bloom_level").$type<"remember" | "understand" | "apply" | "analyze" | "evaluate" | "create">().notNull(),
 evidenceSourceIds: text("evidence_source_ids", { mode: "json" }).$defaultFn(() => []).notNull(),
 relatedKoIds: text("related_ko_ids", { mode: "json" }).$defaultFn(() => []).notNull(),
 status: text("status").$type<"active" | "superseded">().default("active").notNull(),
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 updatedAt: integer("updated_at", { mode: "timestamp" })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_learning_objectives_chapter").on(table.chapterId),
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
  analytics: one(studentQuizAnalytics, {
    fields: [studentQuizAttempts.id],
    references: [studentQuizAnalytics.attemptId],
  }),
}));

export const studentQuizAnalyticsRelations = relations(studentQuizAnalytics, ({ one }) => ({
  attempt: one(studentQuizAttempts, {
    fields: [studentQuizAnalytics.attemptId],
    references: [studentQuizAttempts.id],
  }),
  student: one(user, {
    fields: [studentQuizAnalytics.studentId],
    references: [user.id],
  }),
  template: one(quizTemplates, {
    fields: [studentQuizAnalytics.templateId],
    references: [quizTemplates.id],
  }),
  course: one(courses, {
    fields: [studentQuizAnalytics.courseId],
    references: [courses.id],
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
 inputTokens: integer("input_tokens").default(0).notNull(),
 outputTokens: integer("output_tokens").default(0).notNull(),
 requestType: text("request_type").notNull(), // 'explain_concept' | 'analyze_mistake'
 createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_usage_user_created").on(table.userId, table.createdAt),
 ]
);

export const aiGenerationTraces = sqliteTable(
  "ai_generation_traces",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    useCase: text("use_case"),
    stageId: text("stage_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    policyVersion: text("policy_version").notNull(),
    inputSchemaVersion: text("input_schema_version").notNull(),
    outputSchemaVersion: text("output_schema_version").notNull(),
    validatorVersion: text("validator_version").notNull(),
    sanitizedInputHash: text("sanitized_input_hash").notNull(),
    evidenceHash: text("evidence_hash"),
    model: text("model").notNull(),
    route: text("route"),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    retryCount: integer("retry_count").default(0).notNull(),
    terminalOutcome: text("terminal_outcome").notNull(),
    violationCodes: text("violation_codes"),
    latencyMs: integer("latency_ms").default(0).notNull(),
    cacheResult: text("cache_result").default("none").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_traces_user_created").on(table.userId, table.createdAt),
    index("idx_traces_stage_prompt").on(table.stageId, table.promptVersion),
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
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  recipientCount: integer("recipient_count"),
  isArchived: integer("is_archived", { mode: "boolean" }).default(false).notNull(),
  isPinned: integer("is_pinned", { mode: "boolean" }).default(false).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
});

export const pkaAnnouncementReads = sqliteTable(
  "pka_announcement_reads",
  {
    announcementId: text("announcement_id")
      .notNull()
      .references(() => pkaAnnouncements.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    readAt: integer("read_at", { mode: "timestamp" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.announcementId, table.userId] }),
  ]
);

export const pkaSchedules = sqliteTable("pka_schedules", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  sessionAt: integer("session_at", { mode: "timestamp" }).notNull(),
  meetLink: text("meet_link"), // Optional link
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  recipientCount: integer("recipient_count"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
});

// Gated enrollment intake: incoming students fill this form (name, faculty,
// contact, Instagram follow proof) before an enrollment row is created. The
// receiveAnnouncements opt-in controls whether they get schedule/announcement
// broadcasts. One row per user (uniqueIndex on user_id).
export const pkaRegistrations = sqliteTable(
  "pka_registrations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    faculty: text("faculty").notNull(),
    email: text("email").notNull(),
    instagramUsername: text("instagram_username").notNull(),
    proofKey: text("proof_key").notNull(), // R2 storage key for the follow screenshot
    receiveAnnouncements: integer("receive_announcements", { mode: "boolean" })
      .default(true)
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("uq_pka_registrations_user").on(table.userId)]
);

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

export const pkaAnnouncementsRelations = relations(pkaAnnouncements, ({ one, many }) => ({
  createdByUser: one(user, {
    fields: [pkaAnnouncements.createdBy],
    references: [user.id],
  }),
  reads: many(pkaAnnouncementReads),
}));

export const pkaAnnouncementReadsRelations = relations(pkaAnnouncementReads, ({ one }) => ({
  announcement: one(pkaAnnouncements, {
    fields: [pkaAnnouncementReads.announcementId],
    references: [pkaAnnouncements.id],
  }),
  user: one(user, {
    fields: [pkaAnnouncementReads.userId],
    references: [user.id],
  }),
}));

export const pkaSchedulesRelations = relations(pkaSchedules, ({ one }) => ({
  createdByUser: one(user, {
    fields: [pkaSchedules.createdBy],
    references: [user.id],
  }),
}));

export const pkaRegistrationsRelations = relations(pkaRegistrations, ({ one }) => ({
  student: one(user, {
    fields: [pkaRegistrations.userId],
    references: [user.id],
  }),
}));

// ─── Short Links ────────────────────────────────────────────────────────────
// Custom URL shortener (zyxacademy.com/s/[slug])

export const shortLink = sqliteTable("short_link", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  url: text("url").notNull(),
  title: text("title"),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }), // Creator
  clicks: integer("clicks").default(0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
});

export const shortLinkRelations = relations(shortLink, ({ one }) => ({
  creator: one(user, {
    fields: [shortLink.userId],
    references: [user.id],
  }),
}));

// ─── Analytics ────────────────────────────────────────────────────────────
// Synchronization of GA4 popular pages cache

export const pageAnalytics = sqliteTable("page_analytics", {
  id: text("id").primaryKey(), // The path of the page, e.g., "/courses"
  title: text("title").notNull(),
  views: integer("views").default(0).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().notNull(),
});

// ─── Blog ───────────────────────────────────────────────────────────────────

export const blogArticles = sqliteTable(
  "blog_articles",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    content: text("content").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    category: text("category")
      .$type<"tips_kuliah" | "pojok_kampus" | "fakta_seru" | "kegiatan_zyx">()
      .notNull(),
    readMinutes: integer("read_minutes").default(5).notNull(),
    tags: text("tags", { mode: "json" }).$type<string[]>().$defaultFn(() => []),
    status: text("status").$type<"draft" | "published" | "scheduled">().default("draft").notNull(),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    createdById: text("created_by_id")
      .references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_blog_slug").on(table.slug),
    index("idx_blog_status").on(table.status),
    index("idx_blog_category").on(table.category),
  ]
);

export const blogArticlesRelations = relations(blogArticles, ({ one }) => ({
  author: one(user, {
    fields: [blogArticles.createdById],
    references: [user.id],
  }),
}));
