import { relations, sql } from "drizzle-orm";
import {
 pgTable,
 text,
 bigint,
 boolean,
 timestamp,
 jsonb,
 doublePrecision,
 check,
 index,
 unique,
 uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

// Enums
/** Admin drive ; folder tree + file pointers to UploadThing. */

/** Better Auth core model ; export name must be `user` for the Drizzle adapter. */
export const user = pgTable("user", {
 id: text("id").primaryKey(),
 name: text("name").notNull(),
 email: text("email").notNull().unique(),
 emailVerified: boolean("email_verified").default(false).notNull(),
 image: text("image"),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => /* @__PURE__ */ new Date())
 .notNull(),
 role: text("role").$type<"admin" | "teacher" | "student">().default("student"),
 lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
 faculty: text("faculty"),
 major: text("major"),
 entryYear: bigint("entry_year", { mode: "number" }),
});

/** User-controlled optional email categories. Essential transactional email bypasses this table. */
export const emailNotificationPreferences = pgTable("email_notification_preferences", {
 userId: text("user_id")
  .primaryKey()
  .references(() => user.id, { onDelete: "cascade" }),
 emailEnabled: boolean("email_enabled").default(true).notNull(),
 courseUpdates: boolean("course_updates").default(true).notNull(),
 eventsAndSchedules: boolean("events_and_schedules").default(true).notNull(),
 learningReminders: boolean("learning_reminders").default(true).notNull(),
 newsAndOffers: boolean("news_and_offers").default(false).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
  .defaultNow()
  .$onUpdate(() => /* @__PURE__ */ new Date())
  .notNull(),
});

/** Account presentation preference, kept separate from authorization and learning settings. */
export const accountLocalePreferences = pgTable(
 "account_locale_preferences",
 {
  userId: text("user_id")
   .primaryKey()
   .references(() => user.id, { onDelete: "cascade" }),
  locale: text("locale").$type<"id" | "en">().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
   .defaultNow()
   .$onUpdate(() => new Date())
   .notNull(),
 },
 (table) => [
  check("account_locale_preferences_locale_check", sql`${table.locale} in ('id', 'en')`),
 ],
);

/** Canonical domain identity for a Better Auth user. */
export const pengguna = pgTable(
 "pengguna",
 {
  id: text("id")
   .primaryKey()
   .references(() => user.id, { onDelete: "restrict" }),
  status: text("status").$type<"active" | "suspended">().default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [index("pengguna_status_idx").on(table.status)],
);

/** Stable access-role catalog. IDs are seeded by lib/auth/peran.ts and never regenerated. */
export const peran = pgTable("peran", {
 id: text("id").primaryKey(),
 code: text("code").$type<"admin" | "tutor" | "murid">().notNull().unique(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Independent many-to-many access-role memberships for domain identities. */
export const penggunaPeran = pgTable(
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("pengguna_peran_unique_idx").on(table.penggunaId, table.peranId),
  index("pengguna_peran_pengguna_idx").on(table.penggunaId),
  index("pengguna_peran_peran_idx").on(table.peranId),
 ],
);

export const session = pgTable(
 "session",
 {
 id: text("id").primaryKey(),
 expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
 token: text("token").notNull().unique(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const account = pgTable(
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
 accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
 refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
 scope: text("scope"),
 password: text("password"),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => /* @__PURE__ */ new Date())
 .notNull(),
 },
 (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
 "verification",
 {
 id: text("id").primaryKey(),
 identifier: text("identifier").notNull(),
 value: text("value").notNull(),
 expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => /* @__PURE__ */ new Date())
 .notNull(),
 },
 (table) => [index("verification_identifier_idx").on(table.identifier)],
);

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
export const migrationRuns = pgTable(
 "migration_runs",
 {
  id: text("id").primaryKey(),
  planNumber: text("plan_number").notNull(),
  sourceCommit: text("source_commit").notNull(),
  schemaVersion: text("schema_version").notNull(),
  databaseFingerprint: text("database_fingerprint").notNull(),
  phase: text("phase").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  rowCountManifestHash: text("row_count_manifest_hash"),
  errorCode: text("error_code"),
 },
 (table) => [
  index("migration_runs_plan_idx").on(table.planNumber),
  index("migration_runs_status_idx").on(table.status),
 ],
);

/** Append-only checkpoints emitted by guarded staging commands. */
export const migrationCheckpoints = pgTable(
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
  rowCount: bigint("row_count", { mode: "number" }),
  details: jsonb("details").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
export const legacyBackfillExceptions = pgTable(
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
  details: jsonb("details").$type<Record<string, unknown>>().notNull(),
  blocksCutover: boolean("blocks_cutover").default(false).notNull(),
  sourceChecksum: text("source_checksum").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const driveItem = pgTable(
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
 sizeBytes: bigint("size_bytes", { mode: "number" }),
 createdByUserId: text("created_by_user_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const courses = pgTable("courses", {
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
export const enrollments = pgTable("enrollments", {
 id: text("id").primaryKey(),
 userId: text("user_id").references(() => user.id).notNull(),
 courseId: text("course_id").references(() => courses.id).notNull(),
 enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow(),
 expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // Locks out students once the semester ends
});

// Progress (Materials) Table
export const progress = pgTable("progress", {
 id: text("id").primaryKey(),
 userId: text("user_id").references(() => user.id),
 materialId: text("material_id"), // Ideally references a materials table
 status: text("status").default("completed"),
 completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow(),
});

// Exams (Quizzes and Tryouts) Table
export const exams = pgTable("exams", {
  id: text("id").primaryKey(),
  courseId: text("course_id").references(() => courses.id).notNull(),
  title: text("title").notNull(),
  type: text("type").$type<"quiz" | "tryout">().notNull(), // Specifies if it is a quiz or tryout
  status: text("status").$type<"draft" | "published" | "ended">().default("draft").notNull(), // Can be draft, published, or ended
  settings: jsonb("settings"), // Stores specific limits like "only three submissions" or "one time only"
  openAt: timestamp("open_at", { withTimezone: true }),
  closeAt: timestamp("close_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Questions Table
export const questions = pgTable("questions", {
 id: text("id").primaryKey(),
 examId: text("exam_id").references(() => exams.id).notNull(),
 type: text("type").notNull(), // 'short_answer', 'multiple_choice', 'essay'
 content: jsonb("content").notNull(), // Hybrid approach using JSON blob for question data, options, and correct answers
 order: bigint("order", { mode: "number" }).notNull(),
});

// Submissions Table
export const submissions = pgTable(
	"submissions",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.references(() => user.id)
			.notNull(),
		examId: text("exam_id")
			.references(() => exams.id)
			.notNull(),
		status: text("status")
			.$type<"completed" | "pending_review" | "graded" | "late">()
			.default("completed")
			.notNull(), // Uses "pending_review" for essays
		score: bigint("score", { mode: "number" }), // Stores calculated score
		teacherNotes: text("teacher_notes"), // Allows teacher to manually input feedback/notes
		answersSnapshot: jsonb("answers_snapshot"),
		questionsSnapshot: jsonb("questions_snapshot"),
		submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow(),
		attemptNumber: bigint("attempt_number", { mode: "number" }),
	},
	(table) => [
		uniqueIndex("idx_submissions_user_exam_attempt").on(
			table.userId,
			table.examId,
			table.attemptNumber,
		),
	],
);

// Groups Table
export const groups = pgTable("groups", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	packageType: text("package_type")
		.$type<"reguler_15" | "intensif_30" | "super_intensif_45" | "custom">()
		.default("reguler_15")
		.notNull(),
	packageName: text("package_name").notNull().default("Paket Reguler (15 Sesi)"),
	totalQuotaSessions: bigint("total_quota_sessions", { mode: "number" }).default(15).notNull(),
	usedQuotaSessions: bigint("used_quota_sessions", { mode: "number" }).default(0).notNull(),
	weeklyQuotaSessions: bigint("weekly_quota_sessions", { mode: "number" }).default(2).notNull(),
	academicYear: text("academic_year").default("2026/2027").notNull(),
	semester: text("semester").default("Ganjil").notNull(),
	startDate: timestamp("start_date", { withTimezone: true }),
	endDate: timestamp("end_date", { withTimezone: true }),
	status: text("status")
		.$type<"active" | "completed" | "inactive" | "archived">()
		.default("active")
		.notNull(),
	notes: text("notes"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

// Group Courses Table (Courses assigned to a study group)
export const groupCourses = pgTable(
	"group_courses",
	{
		id: text("id").primaryKey(),
		groupId: text("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		courseId: text("course_id")
			.notNull()
			.references(() => courses.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("group_courses_group_idx").on(table.groupId),
		index("group_courses_course_idx").on(table.courseId),
	]
);

// Group Members Table (Many-to-Many between User and Groups)
export const groupMembers = pgTable(
	"group_members",
	{
		id: text("id").primaryKey(),
		groupId: text("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").$type<"leader" | "member">().default("member").notNull(),
		joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("group_members_group_idx").on(table.groupId),
		index("group_members_user_idx").on(table.userId),
	]
);

// Enrollment Tokens Table
export const enrollmentTokens = pgTable("enrollment_tokens", {
	id: text("id").primaryKey(),
	token: text("token").notNull().unique(),
	groupId: text("group_id")
		.notNull()
		.references(() => groups.id, { onDelete: "cascade" }),
	capacity: bigint("capacity", { mode: "number" }).default(1).notNull(), // Capacity from 1 to 5 people
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Enrollment Token Courses Join Table (Many-to-Many between Token and Courses)
export const enrollmentTokenCourses = pgTable(
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

// Discount Vouchers Table (Referral codes and discount vouchers for student plans)
export const discountVouchers = pgTable(
	"discount_vouchers",
	{
		id: text("id").primaryKey(),
		code: text("code").notNull().unique(),
		discountPercent: bigint("discount_percent", { mode: "number" }).notNull(),
		maxQuota: bigint("max_quota", { mode: "number" }).default(1).notNull(),
		usedQuota: bigint("used_quota", { mode: "number" }).default(0).notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		description: text("description"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("discount_vouchers_code_idx").on(table.code),
		index("discount_vouchers_is_active_idx").on(table.isActive),
	]
);

// Tutor Courses Table (Which courses a tutor can teach)
export const tutorCourses = pgTable(
 "tutor_courses",
 {
 id: text("id").primaryKey(),
 tutorId: text("tutor_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
 index("tutor_courses_tutor_idx").on(table.tutorId),
 index("tutor_courses_course_idx").on(table.courseId),
 ]
);

// Tutor Slots Table (Dated availability slots listed by tutors)
export const tutorSlots = pgTable(
  "tutor_slots",
  {
    id: text("id").primaryKey(),
    tutorId: text("tutor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dayOfWeek: text("day_of_week").notNull(), // 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'
    startTime: text("start_time").notNull(), // '09:00'
    endTime: text("end_time").notNull(), // '10:30'
    mode: text("mode").$type<"online" | "offline">().default("online").notNull(),
    location: text("location"), // Physical room/branch when offline
    // Nullable only for legacy rows. Canonical writes must provide YYYY-MM-DD.
    sessionDate: text("session_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("tutor_slots_tutor_idx").on(table.tutorId),
    index("tutor_slots_tutor_date_idx").on(table.tutorId, table.sessionDate),
    uniqueIndex("tutor_slots_exact_unique_idx").on(
      table.tutorId,
      table.sessionDate,
      table.startTime,
      table.endTime,
    ),
  ]
);

// Bookings Table (Appointments chosen by students)
export const bookings = pgTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    slotId: text("slot_id")
      .notNull()
      .references(() => tutorSlots.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<"scheduled" | "completed" | "cancelled" | "rescheduled">()
      .default("scheduled")
      .notNull(),
    sessionDate: text("session_date"), // ISO date e.g. "2026-08-25"
    startTime: text("start_time"), // e.g. "09:00"
    endTime: text("end_time"), // e.g. "10:30"
    mode: text("mode").$type<"online" | "offline">().default("online").notNull(),
    location: text("location"),
    googleMeetUrl: text("google_meet_url"),
    googleMeetSpaceName: text("google_meet_space_name"),
    lastModifiedBy: text("last_modified_by").references(() => user.id, { onDelete: "set null" }),
    lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }).defaultNow().notNull(),
    topic: text("topic"), // Discussion topic entered by students before session
    preSessionNotes: text("pre_session_notes"),
    preSessionAttachments: jsonb("pre_session_attachments").$type<
      Array<{
        id: string;
        name: string;
        url: string;
        size?: number;
        type?: string;
        uploadedBy: string;
        uploadedByName: string;
        uploadedAt: string;
      }>
    >(),
    postSessionNotes: text("post_session_notes"), // Summary/notes written by tutor
    postSessionAttachments: jsonb("post_session_attachments").$type<
      Array<{
        id: string;
        name: string;
        url: string;
        size?: number;
        type?: string;
        uploadedBy: string;
        uploadedByName: string;
        uploadedAt: string;
      }>
    >(),
    postSessionLinkUrl: text("post_session_link_url"),
    postSessionLinkTitle: text("post_session_link_title"),
    postSessionLinkDescription: text("post_session_link_description"),
    postSessionLinkImage: text("post_session_link_image"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedById: text("completed_by_id").references(() => user.id, { onDelete: "set null" }),
    bookedAt: timestamp("booked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("bookings_occupied_slot_unique_idx")
      .on(table.slotId)
      .where(sql`${table.status} <> 'cancelled'`),
    index("bookings_slot_idx").on(table.slotId),
    index("bookings_student_idx").on(table.studentId),
    index("bookings_group_idx").on(table.groupId),
    index("bookings_status_idx").on(table.status),
    index("bookings_session_date_idx").on(table.sessionDate),
  ]
);

// Normalized resources attached to a booked tutorial session.
export const bookingResources = pgTable(
  "booking_resources",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    phase: text("phase").$type<"pre" | "post">().notNull(),
    kind: text("kind").$type<"link" | "file" | "recording">().notNull(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("booking_resources_booking_idx").on(table.bookingId),
    index("booking_resources_booking_phase_idx").on(table.bookingId, table.phase),
    index("booking_resources_creator_idx").on(table.createdById),
    check("booking_resources_phase_check", sql`${table.phase} IN ('pre', 'post')`),
    check("booking_resources_kind_check", sql`${table.kind} IN ('link', 'file', 'recording')`),
    check("booking_resources_size_check", sql`${table.sizeBytes} IS NULL OR ${table.sizeBytes} >= 0`),
  ],
);

// Audit Trail & Activity Log for Group Bookings
export const bookingAuditLogs = pgTable(
  "booking_audit_logs",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .references(() => groups.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_booking_audit_booking_id").on(table.bookingId),
    index("idx_booking_audit_group_id").on(table.groupId),
    index("idx_booking_audit_actor_id").on(table.actorId),
  ]
);

// Reschedule & Cancellation Tickets
export const bookingRescheduleTickets = pgTable(
  "booking_reschedule_tickets",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    requestedById: text("requested_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tutorId: text("tutor_id")
      .references(() => user.id, { onDelete: "set null" }),
    type: text("type").$type<"reschedule" | "cancellation">().default("reschedule").notNull(),
    status: text("status").$type<"pending" | "approved" | "rejected">().default("pending").notNull(),
    reason: text("reason").notNull(),
    proposedSlotId: text("proposed_slot_id")
      .references(() => tutorSlots.id, { onDelete: "set null" }),
    proposedDate: text("proposed_date"),
    decisionNotes: text("decision_notes"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedById: text("decided_by_id")
      .references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_reschedule_booking_id").on(table.bookingId),
    index("idx_reschedule_group_id").on(table.groupId),
    index("idx_reschedule_status").on(table.status),
  ]
);

// Discussion Thread Messages inside Reschedule Tickets
export const bookingTicketMessages = pgTable(
  "booking_ticket_messages",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => bookingRescheduleTickets.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ticket_messages_ticket_id").on(table.ticketId),
    index("idx_ticket_messages_sender_id").on(table.senderId),
  ]
);

// Academic Schedules Table (Ujian Resmi ITB, Tryout, Kuis)
export const academicSchedules = pgTable(
  "academic_schedules",
  {
    id: text("id").primaryKey(),
    type: text("type").$type<"official_exam" | "tryout" | "quiz" | "general">().default("official_exam").notNull(),
    title: text("title").notNull(),
    courseId: text("course_id")
      .references(() => courses.id, { onDelete: "set null" }),
    description: text("description"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    location: text("location"),
    createdById: text("created_by_id")
      .references(() => user.id, { onDelete: "set null" }),
    status: text("status").$type<"published" | "draft" | "archived">().default("published").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_academic_sched_type").on(table.type),
    index("idx_academic_sched_course_id").on(table.courseId),
    index("idx_academic_sched_start_date").on(table.startDate),
  ]
);

// Relations for user
export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  tutorCourses: many(tutorCourses),
  tutorSlots: many(tutorSlots),
  bookingResources: many(bookingResources),
  enrollments: many(enrollments),
  emailNotificationPreferences: one(emailNotificationPreferences, {
    fields: [user.id],
    references: [emailNotificationPreferences.userId],
  }),
  accountLocalePreference: one(accountLocalePreferences, {
   fields: [user.id],
   references: [accountLocalePreferences.userId],
  }),
  pengguna: one(pengguna, {
    fields: [user.id],
    references: [pengguna.id],
  }),
}));

export const emailNotificationPreferencesRelations = relations(emailNotificationPreferences, ({ one }) => ({
  user: one(user, {
    fields: [emailNotificationPreferences.userId],
    references: [user.id],
  }),
}));

export const accountLocalePreferencesRelations = relations(accountLocalePreferences, ({ one }) => ({
 user: one(user, {
  fields: [accountLocalePreferences.userId],
  references: [user.id],
 }),
}));

// Relations for groups & enrollment tokens
export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(groupMembers),
  courses: many(groupCourses),
  tokens: many(enrollmentTokens),
  bookings: many(bookings),
  rescheduleTickets: many(bookingRescheduleTickets),
  auditLogs: many(bookingAuditLogs),
}));

export const groupCoursesRelations = relations(groupCourses, ({ one }) => ({
  group: one(groups, {
    fields: [groupCourses.groupId],
    references: [groups.id],
  }),
  course: one(courses, {
    fields: [groupCourses.courseId],
    references: [courses.id],
  }),
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

// Relations for enrollments
export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  user: one(user, {
    fields: [enrollments.userId],
    references: [user.id],
  }),
  course: one(courses, {
    fields: [enrollments.courseId],
    references: [courses.id],
  }),
}));

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
export const tutorSlotsRelations = relations(tutorSlots, ({ one, many }) => ({
  tutor: one(user, {
    fields: [tutorSlots.tutorId],
    references: [user.id],
  }),
  bookings: many(bookings),
  proposedTickets: many(bookingRescheduleTickets),
}));

// Relations for bookings
export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  slot: one(tutorSlots, {
    fields: [bookings.slotId],
    references: [tutorSlots.id],
  }),
  student: one(user, {
    fields: [bookings.studentId],
    references: [user.id],
  }),
  lastModifier: one(user, {
    fields: [bookings.lastModifiedBy],
    references: [user.id],
  }),
  completedBy: one(user, {
    fields: [bookings.completedById],
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
  auditLogs: many(bookingAuditLogs),
  rescheduleTickets: many(bookingRescheduleTickets),
  resources: many(bookingResources),
}));

// Relations for normalized booking resources
export const bookingResourcesRelations = relations(bookingResources, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingResources.bookingId],
    references: [bookings.id],
  }),
  creator: one(user, {
    fields: [bookingResources.createdById],
    references: [user.id],
  }),
}));

// Relations for bookingAuditLogs
export const bookingAuditLogsRelations = relations(bookingAuditLogs, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingAuditLogs.bookingId],
    references: [bookings.id],
  }),
  group: one(groups, {
    fields: [bookingAuditLogs.groupId],
    references: [groups.id],
  }),
  actor: one(user, {
    fields: [bookingAuditLogs.actorId],
    references: [user.id],
  }),
}));

// Relations for bookingRescheduleTickets
export const bookingRescheduleTicketsRelations = relations(bookingRescheduleTickets, ({ one, many }) => ({
  booking: one(bookings, {
    fields: [bookingRescheduleTickets.bookingId],
    references: [bookings.id],
  }),
  group: one(groups, {
    fields: [bookingRescheduleTickets.groupId],
    references: [groups.id],
  }),
  requestedBy: one(user, {
    fields: [bookingRescheduleTickets.requestedById],
    references: [user.id],
  }),
  tutor: one(user, {
    fields: [bookingRescheduleTickets.tutorId],
    references: [user.id],
  }),
  proposedSlot: one(tutorSlots, {
    fields: [bookingRescheduleTickets.proposedSlotId],
    references: [tutorSlots.id],
  }),
  decidedBy: one(user, {
    fields: [bookingRescheduleTickets.decidedById],
    references: [user.id],
  }),
  messages: many(bookingTicketMessages),
}));

// Relations for bookingTicketMessages
export const bookingTicketMessagesRelations = relations(bookingTicketMessages, ({ one }) => ({
  ticket: one(bookingRescheduleTickets, {
    fields: [bookingTicketMessages.ticketId],
    references: [bookingRescheduleTickets.id],
  }),
  sender: one(user, {
    fields: [bookingTicketMessages.senderId],
    references: [user.id],
  }),
}));

// Relations for academicSchedules
export const academicSchedulesRelations = relations(academicSchedules, ({ one }) => ({
  course: one(courses, {
    fields: [academicSchedules.courseId],
    references: [courses.id],
  }),
  creator: one(user, {
    fields: [academicSchedules.createdById],
    references: [user.id],
  }),
}));

// ───────────────────────────────────────────────────────────// Enums for AI domain

// New Enums for Zyx Content Ecosystem (Revision v4 - Frozen)

// A. ai_material_instances ; top-level knowledge asset metadata
export const aiMaterialInstances = pgTable(
 "ai_material_instances",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 title: text("title").notNull(),
 sourceType: text("source_type").$type<"markdown" | "json" | "pdf_extraction">().notNull(),
 summary: text("summary").notNull(),
 learningObjectives: jsonb("learning_objectives").$defaultFn(() => []).notNull(),
 keywords: jsonb("keywords").$defaultFn(() => []).notNull(),
 chapterIds: jsonb("chapter_ids").$type<string[]>().$defaultFn(() => []),
 pineconeSyncStatus: text("pinecone_sync_status").default("pending").notNull(),
 lastSyncError: text("last_sync_error"),
 thumbnailUrl: text("thumbnail_url"),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("ai_instances_course_idx").on(table.courseId),
 ]
);

// B. ai_material_instance_sections ; groups chunks by subtopic
export const aiMaterialInstanceSections = pgTable(
 "ai_material_instance_sections",
 {
 id: text("id").primaryKey(),
 materialInstanceId: text("material_instance_id")
 .notNull()
 .references(() => aiMaterialInstances.id, { onDelete: "cascade" }),
 title: text("title"),
 orderIndex: bigint("order_index", { mode: "number" }).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
 index("ai_sections_instance_idx").on(table.materialInstanceId, table.orderIndex),
 ]
);

// C. ai_material_instance_chunks ; physical text segments synced with Pinecone
export const aiMaterialInstanceChunks = pgTable(
 "ai_material_instance_chunks",
 {
 id: text("id").primaryKey(),
 sectionId: text("section_id")
 .notNull()
 .references(() => aiMaterialInstanceSections.id, { onDelete: "cascade" }),
 chunkText: text("chunk_text").notNull(),
 orderIndex: bigint("order_index", { mode: "number" }).notNull(),
 pineconeVectorId: text("pinecone_vector_id").notNull(),
 isSynced: boolean("is_synced").default(false).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_chunks_section").on(table.sectionId, table.orderIndex),
 ]
);

// D. ai_generation_jobs ; tracks background Gemini generation requests
export const aiGenerationJobs = pgTable(
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
 promptParameters: jsonb("prompt_parameters").notNull(),
 targetCount: bigint("target_count", { mode: "number" }).notNull(),
 generatedCount: bigint("generated_count", { mode: "number" }).default(0).notNull(),
 tokenUsage: bigint("token_usage", { mode: "number" }).default(0).notNull(),
 errorMessage: text("error_message"),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_jobs_status").on(table.courseId, table.status),
 ]
);

// E0. question_generation_runs ; audit trail of batch question generation runs
export const questionGenerationRuns = pgTable(
  "question_generation_runs",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    blueprintVersion: text("blueprint_version").default("2.0").notNull(),
    promptVersion: text("prompt_version").default("2.0").notNull(),
    sourceVersion: text("source_version"),
    shuffleSeed: bigint("shuffle_seed", { mode: "number" }),
    validatorVersion: text("validator_version").default("2.0").notNull(),
    slotCount: bigint("slot_count", { mode: "number" }).default(0).notNull(),
    acceptedCount: bigint("accepted_count", { mode: "number" }).default(0).notNull(),
    status: text("status").$type<"completed" | "failed" | "partial" | "processing">().default("completed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_qgen_runs_course").on(table.courseId),
  ]
);

// E. ai_question_bank ; permanent, reusable question repository (modified for KO references)
export const aiQuestionBank = pgTable(
  "ai_question_bank",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    sourceSectionId: text("source_section_id")
      .references(() => aiMaterialInstanceSections.id, { onDelete: "set null" }),
    origin: text("origin")
      .$type<"zyx_original" | "historical_reference" | "itb_example">()
      .default("zyx_original")
      .notNull(),
    sourceEventName: text("source_event_name"),
    sourceReferenceId: text("source_reference_id"),
    assessmentSourceId: text("assessment_source_id")
      .references(() => assessmentSources.id, { onDelete: "set null" }),
    sourceQuestionNumber: text("source_question_number"),
    sourceQuestionPart: text("source_question_part"),
    sourcePage: bigint("source_page", { mode: "number" }),
    answerProvenance: text("answer_provenance").$type<"official" | "source_solution" | "zyx_generated" | "unavailable">(),
    solutionProvenance: text("solution_provenance").$type<"official" | "source_solution" | "zyx_generated" | "unavailable">(),
    quizEligible: boolean("quiz_eligible").default(false).notNull(),

    // Final v4 adjustments
    knowledgeObjectId: text("knowledge_object_id")
      .references(() => knowledgeObjects.id, { onDelete: "set null" }),
    sourceMtdId: text("source_mtd_id")
      .references(() => masterTeachingDocuments.id, { onDelete: "set null" }),
    sourceMtdVersion: bigint("source_mtd_version", { mode: "number" }),
    generationHash: text("generation_hash"),
    generationRunId: text("generation_run_id")
      .references(() => questionGenerationRuns.id, { onDelete: "set null" }),
    status: text("status").default("active").notNull(),
    isStale: boolean("is_stale").default(false).notNull(),

    difficulty: text("difficulty").$type<"easy" | "medium" | "hard">().default("medium").notNull(),
    questionType: text("question_type").$type<"multiple_choice" | "multiple_choices" | "short_answer" | "essay">().default("multiple_choice").notNull(),
    tags: jsonb("tags").$defaultFn(() => []).notNull(),
    prompt: text("prompt").notNull(),
    options: jsonb("options").notNull(),
    correctIndices: jsonb("correct_indices").notNull(),
    acceptableAnswers: jsonb("acceptable_answers").$type<string[]>(),
    /**
     * EIF E1: per non-correct option, the misconception it represents.
     * One entry per wrong option. Empty/null = not tagged (legacy rows).
     */
    distractorMap: jsonb("distractor_map")
      .$type<Array<{
        optionIndex: number;
        kind: "misconception" | "calc_error" | "unit_error" | "vocab_swap" | "none";
        misconceptionKoId: string | null;
        label: string;
      }>>()
      .$defaultFn(() => []),
    explanation: text("explanation").notNull(),
    reviewStatus: text("review_status").$type<"generated" | "reviewed" | "published" | "flagged" | "retired">().default("generated").notNull(),
    qualityScore: doublePrecision("quality_score"),
    useCount: bigint("use_count", { mode: "number" }).default(0).notNull(),
    styledAfterAssessmentObjectId: text("styled_after_assessment_object_id")
      .references(() => assessmentObjects.id, { onDelete: "set null" }),
    pattern: text("pattern"),
    reasoningType: text("reasoning_type"),
    applicationLevel: bigint("application_level", { mode: "number" }),
    estimatedSteps: bigint("estimated_steps", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_qbank_selection").on(table.courseId, table.reviewStatus, table.difficulty, table.useCount),
    index("idx_qbank_tags").on(table.tags),
    index("idx_qbank_ko").on(table.knowledgeObjectId),
    index("idx_qbank_gen_run").on(table.generationRunId),
    index("idx_qbank_origin").on(table.origin, table.sourceEventName),
    index("idx_qbank_quiz_eligible").on(table.courseId, table.reviewStatus, table.quizEligible),
  ]
);

// E0.1. distractor_provenance ; machine-readable distractor provenance and misconception mapping
export const distractorProvenance = pgTable(
  "distractor_provenance",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => aiQuestionBank.id, { onDelete: "cascade" }),
    optionIndex: bigint("option_index", { mode: "number" }).notNull(),
    stableOptionId: text("stable_option_id").notNull(),
    targetedMisconception: text("targeted_misconception").notNull(),
    misconceptionKoId: text("misconception_ko_id")
      .references(() => knowledgeObjects.id, { onDelete: "set null" }),
    supportingSourceIds: jsonb("supporting_source_ids").$defaultFn(() => []).notNull(),
    mappingMethod: text("mapping_method")
      .$type<"exact_ko" | "heuristic_pattern" | "lexical_overlap" | "embedding_similarity" | "manual_override" | "unknown">()
      .default("unknown")
      .notNull(),
    score: doublePrecision("score").default(0).notNull(),
    methodVersion: text("method_version").default("2.0").notNull(),
    uncertaintyState: text("uncertainty_state")
      .$type<"confident" | "ambiguous" | "unknown">()
      .default("unknown")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_distractor_prov_option").on(table.questionId, table.optionIndex),
    index("idx_distractor_prov_q").on(table.questionId),
    index("idx_distractor_prov_ko").on(table.misconceptionKoId),
  ]
);

// E1. question_option_stats ; aggregate per-option selection counters (distractor analytics)
export const questionOptionStats = pgTable(
 "question_option_stats",
 {
 id: text("id").primaryKey(),
 questionId: text("question_id")
 .notNull()
 .references(() => aiQuestionBank.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 optionIndex: bigint("option_index", { mode: "number" }).notNull(),
 selectedCount: bigint("selected_count", { mode: "number" }).default(0).notNull(),
 totalAttempts: bigint("total_attempts", { mode: "number" }).default(0).notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
 unique("uq_qos_question_option").on(table.questionId, table.optionIndex),
 index("idx_qos_question").on(table.questionId),
 ]
);

// F. quiz_templates ; publishable quiz configurations with selection rules
export const quizTemplates = pgTable(
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
    timeLimitSeconds: bigint("time_limit_seconds", { mode: "number" }),
    maxAttempts: bigint("max_attempts", { mode: "number" }),
    selectionRules: jsonb("selection_rules").notNull(),
    openAt: timestamp("open_at", { withTimezone: true }),
    closeAt: timestamp("close_at", { withTimezone: true }),
    manualStatus: text("manual_status").$type<"open" | "closed" | "scheduled">().default("scheduled").notNull(),
    showDiscussion: boolean("show_discussion").default(false).notNull(),
    spreadsheetId: text("spreadsheet_id"),
    spreadsheetUrl: text("spreadsheet_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
 (table) => [
 index("idx_templates_search").on(table.courseId, table.category, table.visibility),
 ]
);

// G. student_quiz_attempts ; user quiz session with deep question snapshots
export const studentQuizAttempts = pgTable(
 "student_quiz_attempts",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 templateId: text("template_id")
 .notNull()
 .references(() => quizTemplates.id, { onDelete: "cascade" }),
 score: bigint("score", { mode: "number" }),
 durationSeconds: bigint("duration_seconds", { mode: "number" }),
 status: text("status").$type<"in_progress" | "completed" | "abandoned">().default("in_progress").notNull(),
 gradingStatus: text("grading_status").$type<"not_required" | "pending" | "graded">().default("not_required").notNull(),
 questionsSnapshot: jsonb("questions_snapshot").notNull(),
 answersSnapshot: jsonb("answers_snapshot"),
 startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
 submittedAt: timestamp("submitted_at", { withTimezone: true }),
 strongAreas: jsonb("strong_areas"),
 weakAreas: jsonb("weak_areas"),
 recommendedNextSteps: jsonb("recommended_next_steps"),
 /** EIF E2: per-concept mastery score snapshot at attempt start, for the before/after delta. */
 masteryBefore: jsonb("mastery_before").$type<Record<string, number>>(),
 },
 (table) => [
 index("idx_attempts_student").on(table.studentId, table.status),
 index("idx_attempts_completed").on(table.templateId, table.score).where(sql`"status" = 'completed'`),
 index("idx_attempts_grading_status").on(table.templateId, table.gradingStatus),
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

export const quizAiInsights = pgTable(
  "quiz_ai_insights",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id").references(() => quizTemplates.id, { onDelete: "cascade" }),
    examId: text("exam_id").references(() => exams.id, { onDelete: "cascade" }),
    sampleSize: bigint("sample_size", { mode: "number" }).default(0).notNull(),
    insights: jsonb("insights").$type<QuizAiInsightData>().notNull(),
    summary: text("summary"),
    generatedById: text("generated_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const studentQuizAnalytics = pgTable(
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
    computedMetrics: jsonb("computed_metrics"),
    aiDiagnosis: jsonb("ai_diagnosis"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const chapters = pgTable(
 "chapters",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 title: text("title").notNull(),
 description: text("description"),
 orderIndex: bigint("order_index", { mode: "number" }).notNull(),
 status: text("status").default("draft").notNull(), // 'draft', 'published'
 assetGenStatus: text("asset_gen_status").default("idle").notNull(), // 'idle', 'generating', 'completed', 'failed'
 assetGenFlashcardsTotal: bigint("asset_gen_flashcards_total", { mode: "number" }).default(0).notNull(),
 assetGenFlashcardsCurrent: bigint("asset_gen_flashcards_current", { mode: "number" }).default(0).notNull(),
 assetGenQuestionsTotal: bigint("asset_gen_questions_total", { mode: "number" }).default(0).notNull(),
 assetGenQuestionsCurrent: bigint("asset_gen_questions_current", { mode: "number" }).default(0).notNull(),
 assetGenError: text("asset_gen_error"),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_chapters_course_order").on(table.courseId, table.orderIndex),
 ]
);

// 2. student_chapter_progress
export const studentChapterProgress = pgTable(
 "student_chapter_progress",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 chapterId: text("chapter_id")
 .notNull()
 .references(() => chapters.id, { onDelete: "cascade" }),
 unlocked: boolean("unlocked").default(false).notNull(),
 completed: boolean("completed").default(false).notNull(),
 completedAt: timestamp("completed_at", { withTimezone: true }),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_student_chap_prog").on(table.studentId, table.chapterId),
 ]
);

// 3. master_teaching_documents
export const masterTeachingDocuments = pgTable(
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
 version: bigint("version", { mode: "number" }).default(1).notNull(),
 status: text("status").default("draft").notNull(), // 'draft', 'active', 'archived'
 type: text("type").$type<"learning" | "assessment">().default("learning").notNull(),
 sourceHash: text("source_hash"),
 derivedHash: text("derived_hash"),
 createdById: text("created_by_id")
 .notNull()
 .references(() => user.id),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 }
);

// 3.5. concepts & concept_localizations
export const concepts = pgTable(
 "concepts",
 {
 id: text("id").primaryKey(),
 canonicalSlug: text("canonical_slug").notNull().unique(),
 isVerified: boolean("is_verified").default(false).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 }
);

export const conceptLocalizations = pgTable(
 "concept_localizations",
 {
 id: text("id").primaryKey(),
 conceptId: text("concept_id")
 .notNull()
 .references(() => concepts.id, { onDelete: "cascade" }),
 lang: text("lang").$type<"id" | "en">().notNull(),
 displayName: text("display_name").notNull(),
 aliases: jsonb("aliases").$defaultFn(() => []).notNull(),
 technicalStandardTerm: text("technical_standard_term").$type<"id" | "en">().default("id").notNull(),
 embedding: jsonb("embedding").$type<number[]>(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const mataKuliah = pgTable(
 "mata_kuliah",
 {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  status: text("status").$type<"draft" | "active" | "archived">().default("active").notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
  legacyCourseId: text("legacy_course_id").references(() => courses.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
   .defaultNow()
   .$onUpdate(() => /* @__PURE__ */ new Date())
   .notNull(),
 },
 (table) => [
  uniqueIndex("mata_kuliah_code_idx").on(table.code),
  uniqueIndex("mata_kuliah_single_demo_idx")
    .on(table.isDemo)
    .where(sql`${table.isDemo} = true`),
  index("mata_kuliah_legacy_course_idx").on(table.legacyCourseId),
  check("mata_kuliah_status_check", sql`${table.status} IN ('draft', 'active', 'archived')`),
 ],
);

export const bab = pgTable(
 "bab",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id")
   .notNull()
   .references(() => mataKuliah.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  title: text("title").notNull(),
  orderIndex: bigint("order_index", { mode: "number" }).notNull(),
  status: text("status").$type<"draft" | "active" | "archived">().default("active").notNull(),
  legacyChapterId: text("legacy_chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const pendaftaranMurid = pgTable(
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
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  legacyEnrollmentId: text("legacy_enrollment_id").references(() => enrollments.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const penugasanTutor = pgTable(
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const sumberMateri = pgTable(
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
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  checksum: text("checksum").notNull(),
  status: text("status")
   .$type<"draft" | "active" | "withdrawn" | "archived">()
   .default("draft")
   .notNull(),
  creatorId: text("creator_id")
   .notNull()
   .references(() => pengguna.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const potonganSumber = pgTable(
 "potongan_sumber",
 {
  id: text("id").primaryKey(),
  sumberMateriId: text("sumber_materi_id")
   .notNull()
   .references(() => sumberMateri.id, { onDelete: "cascade" }),
  sourceVersion: bigint("source_version", { mode: "number" }).notNull(),
  content: text("content").notNull(),
  pageNumber: bigint("page_number", { mode: "number" }),
  sectionLocator: text("section_locator"),
  startOffset: bigint("start_offset", { mode: "number" }).notNull(),
  endOffset: bigint("end_offset", { mode: "number" }).notNull(),
  checksum: text("checksum").notNull(),
  embeddingEligible: boolean("embedding_eligible").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const ide = pgTable(
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
  difficultyMetadata: jsonb("difficulty_metadata")
   .$type<Record<string, unknown>>()
   .$defaultFn(() => ({}))
   .notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const asalIde = pgTable(
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
  startOffset: bigint("start_offset", { mode: "number" }).notNull(),
  endOffset: bigint("end_offset", { mode: "number" }).notNull(),
  sourceChecksum: text("source_checksum").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("asal_ide_span_idx").on(table.ideId, table.sourceChunkId, table.startOffset, table.endOffset),
  index("asal_ide_ide_idx").on(table.ideId),
  index("asal_ide_source_idx").on(table.sourceChunkId),
  check("asal_ide_offset_check", sql`${table.startOffset} >= 0 AND ${table.endOffset} > ${table.startOffset}`),
 ],
);

export const relasiIde = pgTable(
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
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  status: text("status").$type<"active" | "superseded" | "withdrawn">().default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const bagianPembelajaran = pgTable(
 "bagian_pembelajaran",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
  babId: text("bab_id").notNull().references(() => bab.id, { onDelete: "restrict" }),
  stableKey: text("stable_key").notNull(),
  parentSectionId: text("parent_section_id").references((): any => bagianPembelajaran.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  orderIndex: bigint("order_index", { mode: "number" }).notNull(),
  learningObjective: text("learning_objective").notNull(),
  sourceChunkIds: jsonb("source_chunk_ids").$type<string[]>().$defaultFn(() => []).notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  status: text("status").$type<"published" | "superseded" | "withdrawn">().default("published").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("bagian_pembelajaran_stable_key_idx").on(table.stableKey),
  uniqueIndex("bagian_pembelajaran_slug_idx").on(table.mataKuliahId, table.babId, table.slug),
  uniqueIndex("bagian_pembelajaran_order_idx").on(table.babId, table.parentSectionId, table.orderIndex),
  index("bagian_pembelajaran_parent_idx").on(table.parentSectionId),
  check("bagian_pembelajaran_order_check", sql`${table.orderIndex} >= 0`),
  check("bagian_pembelajaran_version_check", sql`${table.version} > 0`),
  check("bagian_pembelajaran_status_check", sql`${table.status} IN ('published', 'superseded', 'withdrawn')`),
 ],
);

export const bagianPembelajaranIde = pgTable(
 "bagian_pembelajaran_ide",
 {
  id: text("id").primaryKey(),
  bagianPembelajaranId: text("bagian_pembelajaran_id").notNull().references(() => bagianPembelajaran.id, { onDelete: "cascade" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  role: text("role").$type<"primary" | "supporting">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("bagian_pembelajaran_ide_unique_idx").on(table.bagianPembelajaranId, table.ideId),
  index("bagian_pembelajaran_ide_ide_idx").on(table.ideId),
  check("bagian_pembelajaran_ide_role_check", sql`${table.role} IN ('primary', 'supporting')`),
 ],
);

export const ketergantunganProduk = pgTable(
 "ketergantungan_produk",
 {
  id: text("id").primaryKey(),
  upstreamEntityType: text("upstream_entity_type").notNull(),
  upstreamEntityId: text("upstream_entity_id").notNull(),
  upstreamVersion: bigint("upstream_version", { mode: "number" }).notNull(),
  upstreamHash: text("upstream_hash").notNull(),
  downstreamEntityType: text("downstream_entity_type").notNull(),
  downstreamEntityId: text("downstream_entity_id").notNull(),
  downstreamVersion: bigint("downstream_version", { mode: "number" }).notNull(),
  downstreamHash: text("downstream_hash").notNull(),
  freshness: text("freshness")
   .$type<"UP_TO_DATE" | "NEEDS_REVIEW" | "STALE">()
   .default("UP_TO_DATE")
   .notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const petaIdLegacy = pgTable(
 "peta_id_legacy",
 {
  id: text("id").primaryKey(),
  legacyTable: text("legacy_table").notNull(),
  legacyId: text("legacy_id").notNull(),
  targetTable: text("target_table").notNull(),
  targetId: text("target_id").notNull(),
  mappingVersion: bigint("mapping_version", { mode: "number" }).notNull(),
  sourceChecksum: text("source_checksum").notNull(),
  targetChecksum: text("target_checksum").notNull(),
  runId: text("run_id")
   .notNull()
   .references(() => migrationRuns.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const artikel = pgTable(
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
  structureStatus: text("structure_status")
   .$type<"legacy_unreviewed" | "structured" | "needs_reauthoring">()
   .default("legacy_unreviewed")
   .notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  status: text("status").$type<"draft" | "in_review" | "published" | "withdrawn">().default("draft").notNull(),
  sourceHash: text("source_hash").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("artikel_slug_idx").on(table.slug),
  index("artikel_course_idx").on(table.mataKuliahId),
  index("artikel_chapter_idx").on(table.babId),
  index("artikel_status_version_idx").on(table.status, table.version),
  index("artikel_structure_status_idx").on(table.structureStatus),
  check("artikel_version_check", sql`${table.version} > 0`),
  check("artikel_status_check", sql`${table.status} IN ('draft', 'in_review', 'published', 'withdrawn')`),
  check("artikel_structure_status_check", sql`${table.structureStatus} IN ('legacy_unreviewed', 'structured', 'needs_reauthoring')`),
 ],
);

export const artikelIde = pgTable(
 "artikel_ide",
 {
  id: text("id").primaryKey(),
  artikelId: text("artikel_id").notNull().references(() => artikel.id, { onDelete: "cascade" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  weight: doublePrecision("weight").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("artikel_ide_unique_idx").on(table.artikelId, table.ideId),
  index("artikel_ide_ide_idx").on(table.ideId),
  check("artikel_ide_weight_check", sql`${table.weight} > 0 AND ${table.weight} <= 1`),
 ],
);

export const bagianArtikel = pgTable(
 "bagian_artikel",
 {
  id: text("id").primaryKey(),
  artikelId: text("artikel_id").notNull().references(() => artikel.id, { onDelete: "cascade" }),
  bagianPembelajaranId: text("bagian_pembelajaran_id").references(() => bagianPembelajaran.id, { onDelete: "restrict" }),
  parentSectionId: text("parent_section_id").references((): any => bagianArtikel.id, { onDelete: "restrict" }),
  sectionKey: text("section_key").notNull(),
  sectionKind: text("section_kind").$type<"overview" | "topic" | "summary">().notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  learningObjective: text("learning_objective").notNull(),
  orderIndex: bigint("order_index", { mode: "number" }).notNull(),
  estimatedReadingMinutes: bigint("estimated_reading_minutes", { mode: "number" }).notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  status: text("status").$type<"published" | "withdrawn">().default("published").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("bagian_artikel_key_idx").on(table.artikelId, table.version, table.sectionKey),
  uniqueIndex("bagian_artikel_slug_idx").on(table.artikelId, table.version, table.slug),
  uniqueIndex("bagian_artikel_order_idx").on(table.artikelId, table.version, table.parentSectionId, table.orderIndex),
  index("bagian_artikel_learning_section_idx").on(table.bagianPembelajaranId),
  check("bagian_artikel_kind_check", sql`${table.sectionKind} IN ('overview', 'topic', 'summary')`),
  check("bagian_artikel_order_check", sql`${table.orderIndex} >= 0`),
  check("bagian_artikel_minutes_check", sql`${table.estimatedReadingMinutes} > 0`),
  check("bagian_artikel_version_check", sql`${table.version} > 0`),
 ],
);

export const blokArtikel = pgTable(
 "blok_artikel",
 {
  id: text("id").primaryKey(),
  artikelId: text("artikel_id").notNull().references(() => artikel.id, { onDelete: "cascade" }),
  bagianArtikelId: text("bagian_artikel_id").references(() => bagianArtikel.id, { onDelete: "cascade" }),
  blockKey: text("block_key").notNull(),
  blockType: text("block_type").notNull(),
  title: text("title"),
  orderIndex: bigint("order_index", { mode: "number" }).notNull(),
  content: text("content").notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  generationHash: text("generation_hash").notNull(),
  status: text("status").$type<"draft" | "published" | "withdrawn">().default("draft").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("blok_artikel_key_idx").on(table.artikelId, table.version, table.blockKey),
  index("blok_artikel_order_idx").on(table.artikelId, table.version, table.bagianArtikelId, table.orderIndex),
  index("blok_artikel_section_idx").on(table.bagianArtikelId),
  index("blok_artikel_status_idx").on(table.status),
  check("blok_artikel_order_check", sql`${table.orderIndex} >= 0`),
  check("blok_artikel_version_check", sql`${table.version} > 0`),
 ],
);

export const blokArtikelIde = pgTable(
 "blok_artikel_ide",
 {
  id: text("id").primaryKey(),
  blokArtikelId: text("blok_artikel_id").notNull().references(() => blokArtikel.id, { onDelete: "cascade" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("blok_artikel_ide_unique_idx").on(table.blokArtikelId, table.ideId),
  index("blok_artikel_ide_ide_idx").on(table.ideId),
 ],
);

export const blokArtikelSumber = pgTable(
 "blok_artikel_sumber",
 {
  id: text("id").primaryKey(),
  blokArtikelId: text("blok_artikel_id").notNull().references(() => blokArtikel.id, { onDelete: "cascade" }),
  sumberMateriId: text("sumber_materi_id").notNull().references(() => sumberMateri.id, { onDelete: "restrict" }),
  sourceVersion: bigint("source_version", { mode: "number" }).notNull(),
  sourceChecksum: text("source_checksum").notNull(),
  excerptIds: jsonb("excerpt_ids").$type<string[]>().$defaultFn(() => []).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("blok_artikel_sumber_unique_idx").on(table.blokArtikelId, table.sumberMateriId, table.sourceVersion),
  index("blok_artikel_sumber_source_idx").on(table.sumberMateriId),
  check("blok_artikel_sumber_version_check", sql`${table.sourceVersion} > 0`),
 ],
);

export const diktatMateri = pgTable(
 "diktat_materi",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
  babId: text("bab_id").references(() => bab.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  contentMarkdown: text("content_markdown").notNull(),
  fileKey: text("file_key"),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  status: text("status").$type<"draft" | "in_review" | "published" | "withdrawn">().default("draft").notNull(),
  sourceHash: text("source_hash").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("diktat_materi_course_idx").on(table.mataKuliahId),
  index("diktat_materi_chapter_idx").on(table.babId),
  index("diktat_materi_status_version_idx").on(table.status, table.version),
  check("diktat_materi_version_check", sql`${table.version} > 0`),
  check("diktat_materi_status_check", sql`${table.status} IN ('draft', 'in_review', 'published', 'withdrawn')`),
 ],
);

export const diktatIde = pgTable(
 "diktat_ide",
 {
  id: text("id").primaryKey(),
  diktatMateriId: text("diktat_materi_id").notNull().references(() => diktatMateri.id, { onDelete: "cascade" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  weight: doublePrecision("weight").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("diktat_ide_unique_idx").on(table.diktatMateriId, table.ideId),
  index("diktat_ide_ide_idx").on(table.ideId),
  check("diktat_ide_weight_check", sql`${table.weight} > 0 AND ${table.weight} <= 1`),
 ],
);

export const soal = pgTable(
 "soal",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
  babId: text("bab_id").references(() => bab.id, { onDelete: "set null" }),
  questionType: text("question_type").$type<"multiple_choice" | "multiple_choices" | "short_answer" | "essay">().notNull(),
  prompt: text("prompt").notNull(),
  optionsSnapshot: jsonb("options_snapshot").$type<unknown[]>().$defaultFn(() => []).notNull(),
  origin: text("origin").$type<"zyx_original" | "historical_reference" | "itb_example">().default("zyx_original").notNull(),
  sourceEventName: text("source_event_name"),
  sourceReferenceId: text("source_reference_id"),
  assessmentSourceId: text("assessment_source_id").references(() => assessmentSources.id, { onDelete: "set null" }),
  sourceQuestionNumber: text("source_question_number"),
  sourceQuestionPart: text("source_question_part"),
  sourcePage: bigint("source_page", { mode: "number" }),
  sourceLocator: jsonb("source_locator").$type<Record<string, unknown>>(),
  answerProvenance: text("answer_provenance").$type<"official" | "source_solution" | "zyx_generated" | "unavailable">(),
  solutionProvenance: text("solution_provenance").$type<"official" | "source_solution" | "zyx_generated" | "unavailable">(),
  quizEligible: boolean("quiz_eligible").default(false).notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  status: text("status").$type<"draft" | "in_review" | "published" | "retired">().default("draft").notNull(),
  difficulty: text("difficulty").$type<"easy" | "medium" | "hard">().notNull(),
  cognitiveLevel: text("cognitive_level").$type<"remember" | "understand" | "apply" | "analyze" | "evaluate" | "create">().notNull(),
  reasoningPattern: text("reasoning_pattern").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("soal_course_idx").on(table.mataKuliahId),
  index("soal_chapter_idx").on(table.babId),
  index("soal_status_version_idx").on(table.status, table.version),
  index("soal_origin_idx").on(table.origin, table.sourceEventName),
  index("soal_assessment_source_idx").on(table.assessmentSourceId, table.sourceQuestionNumber),
  index("soal_quiz_eligible_idx").on(table.mataKuliahId, table.status, table.quizEligible),
  check("soal_version_check", sql`${table.version} > 0`),
  check("soal_status_check", sql`${table.status} IN ('draft', 'in_review', 'published', 'retired')`),
 ],
);

export const questionReferenceLinks = pgTable(
 "question_reference_links",
 {
  id: text("id").primaryKey(),
  questionId: text("question_id").notNull().references(() => soal.id, { onDelete: "cascade" }),
  referenceQuestionId: text("reference_question_id").notNull().references(() => soal.id, { onDelete: "restrict" }),
  role: text("role").$type<"inspired_by" | "adapted_from" | "derived_from">().notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("question_ref_links_unique_idx").on(table.questionId, table.referenceQuestionId, table.role),
  index("question_ref_links_q_idx").on(table.questionId),
  index("question_ref_links_ref_idx").on(table.referenceQuestionId),
  check("question_ref_links_role_check", sql`${table.role} IN ('inspired_by', 'adapted_from', 'derived_from')`),
  check("question_ref_links_no_self_ref_check", sql`${table.questionId} != ${table.referenceQuestionId}`),
 ],
);

export const soalIde = pgTable(
 "soal_ide",
 {
  id: text("id").primaryKey(),
  soalId: text("soal_id").notNull().references(() => soal.id, { onDelete: "cascade" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  weight: doublePrecision("weight").notNull(),
  role: text("role").$type<"primary" | "supporting" | "required">().default("supporting").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("soal_ide_unique_idx").on(table.soalId, table.ideId),
  index("soal_ide_ide_idx").on(table.ideId),
  check("soal_ide_weight_check", sql`${table.weight} > 0 AND ${table.weight} <= 1`),
 ],
);

export const soalRelasiIde = pgTable(
 "soal_relasi_ide",
 {
  id: text("id").primaryKey(),
  soalId: text("soal_id").notNull().references(() => soal.id, { onDelete: "cascade" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  relationType: text("relation_type").$type<"required" | "prerequisite" | "related">().notNull(),
  rationale: text("rationale"),
  status: text("status").$type<"active" | "withdrawn">().default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("soal_relasi_ide_unique_idx").on(table.soalId, table.ideId, table.relationType),
  index("soal_relasi_ide_ide_idx").on(table.ideId),
  check("soal_relasi_ide_type_check", sql`${table.relationType} IN ('required', 'prerequisite', 'related')`),
 ],
);

export const pembahasanSoal = pgTable(
 "pembahasan_soal",
 {
  id: text("id").primaryKey(),
  soalId: text("soal_id").notNull().references(() => soal.id, { onDelete: "cascade" }),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  content: text("content").notNull(),
  status: text("status").$type<"draft" | "in_review" | "published" | "retired">().default("draft").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("pembahasan_soal_version_idx").on(table.soalId, table.version),
  check("pembahasan_soal_version_check", sql`${table.version} > 0`),
  check("pembahasan_soal_status_check", sql`${table.status} IN ('draft', 'in_review', 'published', 'retired')`),
 ],
);

export const diktatPembahasan = pgTable(
 "diktat_pembahasan",
 {
  id: text("id").primaryKey(),
  diktatMateriId: text("diktat_materi_id").notNull().references(() => diktatMateri.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  status: text("status").$type<"draft" | "in_review" | "published" | "retired">().default("draft").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("diktat_pembahasan_diktat_idx").on(table.diktatMateriId),
  check("diktat_pembahasan_version_check", sql`${table.version} > 0`),
  check("diktat_pembahasan_status_check", sql`${table.status} IN ('draft', 'in_review', 'published', 'retired')`),
 ],
);

export const itemDiktatPembahasan = pgTable(
 "item_diktat_pembahasan",
 {
  id: text("id").primaryKey(),
  diktatPembahasanId: text("diktat_pembahasan_id").notNull().references(() => diktatPembahasan.id, { onDelete: "cascade" }),
  soalId: text("soal_id").notNull().references(() => soal.id, { onDelete: "restrict" }),
  orderIndex: bigint("order_index", { mode: "number" }).notNull(),
  contentSnapshot: jsonb("content_snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("item_diktat_pembahasan_order_idx").on(table.diktatPembahasanId, table.orderIndex),
  uniqueIndex("item_diktat_pembahasan_soal_idx").on(table.diktatPembahasanId, table.soalId),
  check("item_diktat_pembahasan_order_check", sql`${table.orderIndex} >= 0`),
 ],
);

export const soalItbReferensi = pgTable(
 "soal_itb_referensi",
 {
  id: text("id").primaryKey(),
  soalId: text("soal_id").references(() => soal.id, { onDelete: "set null" }),
  sourceLabel: text("source_label").notNull(),
  authoringVisibility: text("authoring_visibility").$type<"allowed" | "holdout">().notNull(),
  contentSnapshot: jsonb("content_snapshot").$type<Record<string, unknown>>().notNull(),
  checksum: text("checksum").notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("soal_itb_referensi_checksum_idx").on(table.checksum),
  index("soal_itb_referensi_visibility_idx").on(table.authoringVisibility),
  check("soal_itb_referensi_visibility_check", sql`${table.authoringVisibility} IN ('allowed', 'holdout')`),
  check("soal_itb_referensi_version_check", sql`${table.version} > 0`),
 ],
);

export const benchmarkSoal = pgTable(
 "benchmark_soal",
 {
  id: text("id").primaryKey(),
  soalItbReferensiId: text("soal_itb_referensi_id").references(() => soalItbReferensi.id, { onDelete: "set null" }),
  datasetKey: text("dataset_key").notNull(),
  authoringVisibility: text("authoring_visibility").$type<"allowed" | "holdout">().notNull(),
  questionSnapshot: jsonb("question_snapshot").$type<Record<string, unknown>>().notNull(),
  answerSnapshot: jsonb("answer_snapshot").$type<Record<string, unknown>>().notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  checksum: text("checksum").notNull(),
  status: text("status").$type<"active" | "retired">().default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("benchmark_soal_checksum_idx").on(table.checksum),
  index("benchmark_soal_dataset_idx").on(table.datasetKey),
  check("benchmark_soal_visibility_check", sql`${table.authoringVisibility} IN ('allowed', 'holdout')`),
  check("benchmark_soal_version_check", sql`${table.version} > 0`),
 ],
);

export const setFlashcard = pgTable(
 "set_flashcard",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
  babId: text("bab_id").references(() => bab.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  status: text("status").$type<"draft" | "in_review" | "published" | "retired">().default("draft").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("set_flashcard_course_idx").on(table.mataKuliahId),
  index("set_flashcard_chapter_idx").on(table.babId),
  index("set_flashcard_status_version_idx").on(table.status, table.version),
  check("set_flashcard_version_check", sql`${table.version} > 0`),
  check("set_flashcard_status_check", sql`${table.status} IN ('draft', 'in_review', 'published', 'retired')`),
 ],
);

export const flashcard = pgTable(
 "flashcard",
 {
  id: text("id").primaryKey(),
  setFlashcardId: text("set_flashcard_id").notNull().references(() => setFlashcard.id, { onDelete: "cascade" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  explanation: text("explanation"),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  status: text("status").$type<"draft" | "published" | "retired">().default("draft").notNull(),
  generationHash: text("generation_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("flashcard_set_idx").on(table.setFlashcardId),
  index("flashcard_status_version_idx").on(table.status, table.version),
  check("flashcard_version_check", sql`${table.version} > 0`),
 ],
);

export const flashcardIde = pgTable(
 "flashcard_ide",
 {
  id: text("id").primaryKey(),
  flashcardId: text("flashcard_id").notNull().references(() => flashcard.id, { onDelete: "cascade" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  weight: doublePrecision("weight").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("flashcard_ide_unique_idx").on(table.flashcardId, table.ideId),
  index("flashcard_ide_ide_idx").on(table.ideId),
  check("flashcard_ide_weight_check", sql`${table.weight} > 0 AND ${table.weight} <= 1`),
 ],
);

export const kemajuanFlashcardMurid = pgTable(
 "kemajuan_flashcard_murid",
 {
  id: text("id").primaryKey(),
  penggunaId: text("pengguna_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  flashcardId: text("flashcard_id").notNull().references(() => flashcard.id, { onDelete: "restrict" }),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  intervalDays: doublePrecision("interval_days").default(0).notNull(),
  easeFactor: doublePrecision("ease_factor").default(2.5).notNull(),
  repetitions: bigint("repetitions", { mode: "number" }).default(0).notNull(),
  lapses: bigint("lapses", { mode: "number" }).default(0).notNull(),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  status: text("status").$type<"active" | "suspended" | "completed">().default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("kemajuan_flashcard_murid_unique_idx").on(table.penggunaId, table.flashcardId),
  index("kemajuan_flashcard_murid_due_idx").on(table.penggunaId, table.dueAt),
  check("kemajuan_flashcard_murid_interval_check", sql`${table.intervalDays} >= 0`),
  check("kemajuan_flashcard_murid_ease_check", sql`${table.easeFactor} > 0`),
 ],
);

export const reviewFlashcard = pgTable(
 "review_flashcard",
 {
  id: text("id").primaryKey(),
  kemajuanFlashcardMuridId: text("kemajuan_flashcard_murid_id").notNull().references(() => kemajuanFlashcardMurid.id, { onDelete: "restrict" }),
  grade: bigint("grade", { mode: "number" }).notNull(),
  responseMs: bigint("response_ms", { mode: "number" }),
  previousDueAt: timestamp("previous_due_at", { withTimezone: true }).notNull(),
  nextDueAt: timestamp("next_due_at", { withTimezone: true }).notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  index("review_flashcard_progress_idx").on(table.kemajuanFlashcardMuridId, table.reviewedAt),
  check("review_flashcard_grade_check", sql`${table.grade} >= 0 AND ${table.grade} <= 5`),
  check("review_flashcard_response_check", sql`${table.responseMs} IS NULL OR ${table.responseMs} >= 0`),
 ],
);

export const blueprintAsesmen = pgTable(
 "blueprint_asesmen",
 {
  id: text("id").primaryKey(),
  mataKuliahId: text("mata_kuliah_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  assessmentType: text("assessment_type").$type<"quiz" | "tryout">().notNull(),
  blueprint: jsonb("blueprint").$type<Record<string, unknown>>().notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  status: text("status").$type<"draft" | "approved" | "retired">().default("draft").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("blueprint_asesmen_course_idx").on(table.mataKuliahId),
  index("blueprint_asesmen_status_version_idx").on(table.status, table.version),
  check("blueprint_asesmen_version_check", sql`${table.version} > 0`),
  check("blueprint_asesmen_type_check", sql`${table.assessmentType} IN ('quiz', 'tryout')`),
 ],
);

export const asesmen = pgTable(
 "asesmen",
 {
  id: text("id").primaryKey(),
  blueprintAsesmenId: text("blueprint_asesmen_id").notNull().references(() => blueprintAsesmen.id, { onDelete: "restrict" }),
  mataKuliahId: text("mata_kuliah_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  assessmentType: text("assessment_type").$type<"quiz" | "tryout">().notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  status: text("status").$type<"draft" | "published" | "ended" | "retired">().default("draft").notNull(),
  generationHash: text("generation_hash").notNull(),
  creatorId: text("creator_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  curatorId: text("curator_id").references(() => pengguna.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  index("asesmen_course_idx").on(table.mataKuliahId),
  index("asesmen_status_version_idx").on(table.status, table.version),
  check("asesmen_version_check", sql`${table.version} > 0`),
  check("asesmen_type_check", sql`${table.assessmentType} IN ('quiz', 'tryout')`),
 ],
);

export const cakupanAsesmen = pgTable(
 "cakupan_asesmen",
 {
  id: text("id").primaryKey(),
  asesmenId: text("asesmen_id").notNull().references(() => asesmen.id, { onDelete: "cascade" }),
  babId: text("bab_id").notNull().references(() => bab.id, { onDelete: "restrict" }),
  orderIndex: bigint("order_index", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("cakupan_asesmen_chapter_idx").on(table.asesmenId, table.babId),
  uniqueIndex("cakupan_asesmen_order_idx").on(table.asesmenId, table.orderIndex),
  check("cakupan_asesmen_order_check", sql`${table.orderIndex} >= 0`),
 ],
);

export const itemAsesmen = pgTable(
 "item_asesmen",
 {
  id: text("id").primaryKey(),
  asesmenId: text("asesmen_id").notNull().references(() => asesmen.id, { onDelete: "cascade" }),
  soalId: text("soal_id").notNull().references(() => soal.id, { onDelete: "restrict" }),
  orderIndex: bigint("order_index", { mode: "number" }).notNull(),
  renderedQuestionSnapshot: jsonb("rendered_question_snapshot").$type<Record<string, unknown>>().notNull(),
  optionOrderSnapshot: jsonb("option_order_snapshot").$type<string[]>().notNull(),
  gradingPolicySnapshot: jsonb("grading_policy_snapshot").$type<Record<string, unknown>>().notNull(),
  contentVersion: bigint("content_version", { mode: "number" }).notNull(),
  generationHash: text("generation_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("item_asesmen_order_idx").on(table.asesmenId, table.orderIndex),
  uniqueIndex("item_asesmen_soal_idx").on(table.asesmenId, table.soalId),
  check("item_asesmen_order_check", sql`${table.orderIndex} >= 0`),
  check("item_asesmen_content_version_check", sql`${table.contentVersion} > 0`),
 ],
);

export const percobaanAsesmen = pgTable(
 "percobaan_asesmen",
 {
  id: text("id").primaryKey(),
  asesmenId: text("asesmen_id").notNull().references(() => asesmen.id, { onDelete: "restrict" }),
  penggunaId: text("pengguna_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  status: text("status").$type<"in_progress" | "submitted" | "graded" | "cancelled">().default("in_progress").notNull(),
  renderedQuestionSnapshot: jsonb("rendered_question_snapshot").$type<Record<string, unknown>>().notNull(),
  optionOrderSnapshot: jsonb("option_order_snapshot").$type<Record<string, unknown>>().notNull(),
  gradingPolicySnapshot: jsonb("grading_policy_snapshot").$type<Record<string, unknown>>().notNull(),
  contentVersion: bigint("content_version", { mode: "number" }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  index("percobaan_asesmen_murid_idx").on(table.penggunaId, table.createdAt),
  index("percobaan_asesmen_assessment_idx").on(table.asesmenId, table.status),
  check("percobaan_asesmen_content_version_check", sql`${table.contentVersion} > 0`),
 ],
);

export const jawabanMurid = pgTable(
 "jawaban_murid",
 {
  id: text("id").primaryKey(),
  percobaanAsesmenId: text("percobaan_asesmen_id").notNull().references(() => percobaanAsesmen.id, { onDelete: "restrict" }),
  itemAsesmenId: text("item_asesmen_id").notNull().references(() => itemAsesmen.id, { onDelete: "restrict" }),
  renderedQuestionSnapshot: jsonb("rendered_question_snapshot").$type<Record<string, unknown>>().notNull(),
  optionOrderSnapshot: jsonb("option_order_snapshot").$type<string[]>().notNull(),
  responseSnapshot: jsonb("response_snapshot").$type<Record<string, unknown>>().notNull(),
  gradingPolicySnapshot: jsonb("grading_policy_snapshot").$type<Record<string, unknown>>().notNull(),
  contentVersion: bigint("content_version", { mode: "number" }).notNull(),
  score: doublePrecision("score"),
  status: text("status").$type<"ungraded" | "correct" | "incorrect" | "partial" | "needs_review">().default("ungraded").notNull(),
  reviewerId: text("reviewer_id").references(() => pengguna.id, { onDelete: "set null" }),
  reviewNotes: text("review_notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewRevision: bigint("review_revision", { mode: "number" }).default(0).notNull(),
  answeredAt: timestamp("answered_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("jawaban_murid_attempt_item_idx").on(table.percobaanAsesmenId, table.itemAsesmenId),
  index("jawaban_murid_status_idx").on(table.status),
  check("jawaban_murid_content_version_check", sql`${table.contentVersion} > 0`),
 ],
);

export const buktiIdeJawaban = pgTable(
 "bukti_ide_jawaban",
 {
  id: text("id").primaryKey(),
  jawabanMuridId: text("jawaban_murid_id").notNull().references(() => jawabanMurid.id, { onDelete: "restrict" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  scoreContribution: doublePrecision("score_contribution").notNull(),
  weight: doublePrecision("weight").notNull(),
  confidence: bigint("confidence", { mode: "number" }).notNull(),
  evidenceSource: text("evidence_source").notNull(),
  rubricVersion: text("rubric_version").notNull(),
  derivationStatus: text("derivation_status").$type<"deterministic" | "reviewed" | "ambiguous" | "rejected">().notNull(),
  ambiguous: boolean("ambiguous").default(false).notNull(),
  affectsMastery: boolean("affects_mastery").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("bukti_ide_jawaban_unique_idx").on(table.jawabanMuridId, table.ideId),
  index("bukti_ide_jawaban_ide_idx").on(table.ideId),
   check("bukti_ide_jawaban_weight_check", sql`${table.weight} > 0 AND ${table.weight} <= 1`),
   check("bukti_ide_jawaban_confidence_check", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
   check("bukti_ide_jawaban_ambiguous_mastery_check", sql`NOT (${table.ambiguous} AND ${table.affectsMastery})`),
 ],
);

export const buktiPembelajaran = pgTable(
 "bukti_pembelajaran",
 {
  id: text("id").primaryKey(),
  penggunaId: text("pengguna_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  evidenceSource: text("evidence_source").notNull(),
  sourceId: text("source_id").notNull(),
  scoreContribution: doublePrecision("score_contribution").notNull(),
  confidence: bigint("confidence", { mode: "number" }).notNull(),
  rubricVersion: text("rubric_version").notNull(),
  derivationStatus: text("derivation_status").$type<"deterministic" | "reviewed" | "ambiguous" | "rejected">().notNull(),
  ambiguous: boolean("ambiguous").default(false).notNull(),
  affectsMastery: boolean("affects_mastery").default(false).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  index("bukti_pembelajaran_murid_ide_idx").on(table.penggunaId, table.ideId),
   index("bukti_pembelajaran_source_idx").on(table.evidenceSource, table.sourceId),
   uniqueIndex("bukti_pembelajaran_idempotency_idx").on(table.evidenceSource, table.sourceId, table.ideId, table.rubricVersion),
   check("bukti_pembelajaran_confidence_check", sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`),
   check("bukti_pembelajaran_ambiguous_mastery_check", sql`NOT (${table.ambiguous} AND ${table.affectsMastery})`),
 ],
);

export const pemahamanIde = pgTable(
 "pemahaman_ide",
 {
  id: text("id").primaryKey(),
  penggunaId: text("pengguna_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  skor: bigint("skor", { mode: "number" }).notNull(),
  keyakinan: bigint("keyakinan", { mode: "number" }).notNull(),
  evidenceCount: bigint("evidence_count", { mode: "number" }).default(0).notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  algorithmVersion: text("algorithm_version").default("per-idea.v1").notNull(),
  inputWatermark: text("input_watermark").default("").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export const perubahanPemahaman = pgTable(
 "perubahan_pemahaman",
 {
  id: text("id").primaryKey(),
  pemahamanIdeId: text("pemahaman_ide_id").notNull().references(() => pemahamanIde.id, { onDelete: "restrict" }),
  evidenceId: text("evidence_id").references(() => buktiPembelajaran.id, { onDelete: "set null" }),
  previousScore: bigint("previous_score", { mode: "number" }).notNull(),
  nextScore: bigint("next_score", { mode: "number" }).notNull(),
  previousConfidence: bigint("previous_confidence", { mode: "number" }).notNull(),
  nextConfidence: bigint("next_confidence", { mode: "number" }).notNull(),
  reason: text("reason").notNull(),
  evidenceIds: jsonb("evidence_ids").$type<string[]>().default([]).notNull(),
  algorithmVersion: text("algorithm_version").default("per-idea.v1").notNull(),
  inputWatermark: text("input_watermark").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  index("perubahan_pemahaman_ide_idx").on(table.pemahamanIdeId, table.createdAt),
  check("perubahan_pemahaman_score_check", sql`${table.previousScore} >= 0 AND ${table.previousScore} <= 100 AND ${table.nextScore} >= 0 AND ${table.nextScore} <= 100`),
  check("perubahan_pemahaman_confidence_check", sql`${table.previousConfidence} >= 0 AND ${table.previousConfidence} <= 100 AND ${table.nextConfidence} >= 0 AND ${table.nextConfidence} <= 100`),
 ],
);

export const rekomendasiFlashcard = pgTable(
 "rekomendasi_flashcard",
 {
  id: text("id").primaryKey(),
  penggunaId: text("pengguna_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  flashcardId: text("flashcard_id").notNull().references(() => flashcard.id, { onDelete: "restrict" }),
  ideId: text("ide_id").notNull().references(() => ide.id, { onDelete: "restrict" }),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(),
  status: text("status").$type<"pending" | "accepted" | "dismissed" | "completed">().default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("rekomendasi_flashcard_unique_idx").on(table.penggunaId, table.flashcardId, table.dueAt),
  index("rekomendasi_flashcard_due_idx").on(table.penggunaId, table.dueAt),
 ],
);

export const imporBundle = pgTable(
 "impor_bundle",
 {
 id: text("id").primaryKey(),
 insertionOrder: bigint("insertion_order", { mode: "number" }).generatedByDefaultAsIdentity().notNull(),
 bundleId: text("bundle_id").notNull(),
 checksum: text("checksum").notNull(),
 bundleType: text("bundle_type").$type<"source" | "idea" | "product" | "assessment" | "mixed">().notNull(),
 courseId: text("course_id").references(() => courses.id, { onDelete: "restrict" }),
 sourceUriOrKey: text("source_uri_or_key").notNull(),
 version: bigint("version", { mode: "number" }).default(1).notNull(),
 status: text("status").$type<"received" | "validated" | "rejected" | "approved" | "draft" | "published" | "withdrawn" | "discarding">().default("received").notNull(),
 validationReport: jsonb("validation_report").$type<Record<string, unknown>>().$defaultFn(() => ({})).notNull(),
  requestedBy: text("requested_by").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("impor_bundle_identity_idx").on(table.bundleId, table.checksum),
  index("impor_bundle_status_idx").on(table.status),
  check("impor_bundle_version_check", sql`${table.version} > 0`),
 ],
);

export const itemImporBundle = pgTable(
 "item_impor_bundle",
 {
  id: text("id").primaryKey(),
  imporBundleId: text("impor_bundle_id").notNull().references(() => imporBundle.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  entityVersion: bigint("entity_version", { mode: "number" }).notNull(),
  entityHash: text("entity_hash").notNull(),
  status: text("status").$type<"pending" | "validated" | "rejected" | "draft" | "published" | "withdrawn">().default("pending").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("item_impor_bundle_entity_idx").on(table.imporBundleId, table.entityType, table.entityId, table.entityVersion),
  index("item_impor_bundle_status_idx").on(table.status),
  check("item_impor_bundle_version_check", sql`${table.entityVersion} > 0`),
 ],
);

export const reviewBundle = pgTable(
 "review_bundle",
 {
  id: text("id").primaryKey(),
  imporBundleId: text("impor_bundle_id").notNull().references(() => imporBundle.id, { onDelete: "restrict" }),
  reviewerId: text("reviewer_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  status: text("status").$type<"pending" | "approved" | "rejected">().default("pending").notNull(),
  notes: text("notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("review_bundle_reviewer_idx").on(table.imporBundleId, table.reviewerId),
  index("review_bundle_status_idx").on(table.status),
 ],
);

export const reviewItemBundle = pgTable(
 "review_item_bundle",
 {
  id: text("id").primaryKey(),
  imporBundleId: text("impor_bundle_id").notNull().references(() => imporBundle.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  productId: text("product_id"),
  blockId: text("block_id"),
  targetType: text("target_type").$type<"idea" | "article_section" | "article_block">().default("article_block").notNull(),
  targetId: text("target_id"),
  status: text("status").$type<"pending" | "approved" | "changes_requested">().default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("review_item_bundle_target_idx").on(table.imporBundleId, table.reviewerId, table.targetType, table.targetId),
  index("review_item_bundle_import_idx").on(table.imporBundleId),
  index("review_item_bundle_status_idx").on(table.status),
  check("review_item_bundle_target_type_check", sql`${table.targetType} IN ('idea', 'article_section', 'article_block')`),
 ],
);

export const publikasiBundle = pgTable(
 "publikasi_bundle",
 {
  id: text("id").primaryKey(),
  imporBundleId: text("impor_bundle_id").notNull().references(() => imporBundle.id, { onDelete: "restrict" }),
  approvedReviewId: text("approved_review_id").notNull().references(() => reviewBundle.id, { onDelete: "restrict" }),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  publicationHash: text("publication_hash").notNull(),
  status: text("status").$type<"pending" | "published" | "withdrawn">().default("pending").notNull(),
  publishedBy: text("published_by").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  uniqueIndex("publikasi_bundle_version_idx").on(table.imporBundleId, table.version),
  index("publikasi_bundle_status_idx").on(table.status),
  check("publikasi_bundle_version_check", sql`${table.version} > 0`),
 ],
);

export const reviewPedagogiBundle = pgTable(
  "review_pedagogi_bundle",
  {
    id: text("id").primaryKey(),
    imporBundleId: text("impor_bundle_id")
      .notNull()
      .references(() => imporBundle.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => pengguna.id, { onDelete: "restrict" }),
    contentFingerprint: text("content_fingerprint").notNull(),
    policyVersion: text("policy_version").notNull(),
    status: text("status")
      .$type<"pending" | "approved" | "rejected" | "changes_requested">()
      .default("pending")
      .notNull(),
    rubric: jsonb("rubric")
      .$type<Record<string, unknown>>()
      .notNull(),
    exceptions: jsonb("exceptions")
      .$type<Array<Record<string, unknown>>>()
      .default([])
      .notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("review_pedagogi_bundle_decision_idx").on(
      table.imporBundleId,
      table.reviewerId,
      table.contentFingerprint,
      table.policyVersion,
    ),
    index("review_pedagogi_bundle_import_idx").on(table.imporBundleId),
    index("review_pedagogi_bundle_reviewer_idx").on(table.reviewerId),
    index("review_pedagogi_bundle_fingerprint_idx").on(table.contentFingerprint),
    index("review_pedagogi_bundle_status_idx").on(table.status),
    check(
      "review_pedagogi_bundle_status_check",
      sql`${table.status} IN ('pending', 'approved', 'rejected', 'changes_requested')`,
    ),
  ],
);

export const reviewPedagogiBundleRelations = relations(reviewPedagogiBundle, ({ one }) => ({
  imporBundle: one(imporBundle, {
    fields: [reviewPedagogiBundle.imporBundleId],
    references: [imporBundle.id],
  }),
  reviewer: one(pengguna, {
    fields: [reviewPedagogiBundle.reviewerId],
    references: [pengguna.id],
  }),
}));

export const buktiPdfBundle = pgTable(
  "bukti_pdf_bundle",
  {
    id: text("id").primaryKey(),
    imporBundleId: text("impor_bundle_id")
      .notNull()
      .references(() => imporBundle.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    articleVersion: bigint("article_version", { mode: "number" }).notNull(),
    articleHash: text("article_hash").notNull(),
    diktatHash: text("diktat_hash").notNull(),
    rendererVersion: text("renderer_version").notNull(),
    printProfile: text("print_profile").notNull(),
    storageKey: text("storage_key"),
    pageCount: bigint("page_count", { mode: "number" }),
    status: text("status")
      .$type<"pending" | "ready" | "failed" | "stale">()
      .default("pending")
      .notNull(),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("bukti_pdf_bundle_lineage_idx").on(
      table.imporBundleId,
      table.productId,
      table.diktatHash,
      table.printProfile,
    ),
    index("bukti_pdf_bundle_import_idx").on(table.imporBundleId),
    index("bukti_pdf_bundle_product_idx").on(table.productId),
    index("bukti_pdf_bundle_status_idx").on(table.status),
    index("bukti_pdf_bundle_diktat_hash_idx").on(table.diktatHash),
    index("bukti_pdf_bundle_article_hash_idx").on(table.articleHash),
    check(
      "bukti_pdf_bundle_page_count_check",
      sql`${table.pageCount} IS NULL OR (${table.pageCount} >= 1 AND ${table.pageCount} <= 4)`,
    ),
    check(
      "bukti_pdf_bundle_status_check",
      sql`${table.status} IN ('pending', 'ready', 'failed', 'stale')`,
    ),
    check(
      "bukti_pdf_bundle_article_version_check",
      sql`${table.articleVersion} > 0`,
    ),
  ],
);

export const buktiPdfBundleRelations = relations(buktiPdfBundle, ({ one }) => ({
  imporBundle: one(imporBundle, {
    fields: [buktiPdfBundle.imporBundleId],
    references: [imporBundle.id],
  }),
}));

export const auditMutasi = pgTable(
 "audit_mutasi",
 {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => pengguna.id, { onDelete: "set null" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  beforeSnapshot: jsonb("before_snapshot").$type<Record<string, unknown> | null>(),
  afterSnapshot: jsonb("after_snapshot").$type<Record<string, unknown> | null>(),
  correlationId: text("correlation_id"),
  courseId: text("course_id"),
  outcome: text("outcome").$type<"success" | "rejected" | "failed">(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
  index("audit_mutasi_entity_idx").on(table.entityType, table.entityId, table.createdAt),
  index("audit_mutasi_actor_idx").on(table.actorId, table.createdAt),
  index("audit_mutasi_course_outcome_idx").on(table.courseId, table.outcome, table.createdAt),
  check("audit_mutasi_outcome_check", sql`${table.outcome} IS NULL OR ${table.outcome} IN ('success', 'rejected', 'failed')`),
 ],
);

export const alurKonten = pgTable(
 "alur_konten",
 {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  courseId: text("course_id").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  state: text("state")
   .$type<"uploaded" | "validated" | "staged" | "tutor_review" | "changes_requested" | "admin_review" | "approved" | "published" | "superseded" | "withdrawn">()
   .notNull(),
  contentHash: text("content_hash").notNull(),
  assignedTutorId: text("assigned_tutor_id").references(() => pengguna.id, { onDelete: "set null" }),
  lastRequestId: text("last_request_id").notNull(),
  lastReason: text("last_reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("alur_konten_entity_version_idx").on(table.entityType, table.entityId, table.version),
  index("alur_konten_course_state_idx").on(table.courseId, table.state),
  check("alur_konten_version_check", sql`${table.version} > 0`),
  check("alur_konten_state_check", sql`${table.state} IN ('uploaded', 'validated', 'staged', 'tutor_review', 'changes_requested', 'admin_review', 'approved', 'published', 'superseded', 'withdrawn')`),
 ],
);

// 4. knowledge_objects
export const knowledgeObjects = pgTable(
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
 learningOrder: bigint("learning_order", { mode: "number" }).notNull(),
 title: text("title").notNull(),
 conceptName: text("concept_name").notNull(),
 content: text("content").notNull(), // Markdown + LaTeX
 type: text("type").$type<"definition" | "formula" | "example" | "misconception" | "exercise" | "summary" | "objective" | "concept_overview">().notNull(),
 difficulty: text("difficulty").$type<"easy" | "medium" | "hard">().default("medium").notNull(),
 bloomLevel: text("bloom_level").$type<"remember" | "understand" | "apply" | "analyze" | "evaluate" | "create">().notNull(),
 tags: jsonb("tags").$defaultFn(() => []).notNull(),
 importance: text("importance").$type<"high" | "medium" | "low">().default("medium").notNull(),
 metadata: jsonb("metadata").$defaultFn(() => ({})).notNull(),
 pineconeVectorId: text("pinecone_vector_id"), // Nullable until vector sync succeeds
 status: text("status").$type<"active" | "retired" | "superseded" | "needs_review">().default("active").notNull(),
 stableKey: text("stable_key"),
 semanticHash: text("semantic_hash"),
 version: bigint("version", { mode: "number" }).default(1).notNull(),
 knowledgeKind: text("knowledge_kind").$type<"definition" | "principle" | "formula" | "procedure" | "example" | "constraint" | "misconception" | "other">().default("other").notNull(),
 instructionalRole: text("instructional_role").$type<"core" | "prerequisite" | "enrichment" | "assessment_support" | "reference">().default("core").notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const extractionRuns = pgTable(
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
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const knowledgeObjectSources = pgTable(
 "knowledge_object_sources",
 {
 id: text("id").primaryKey(),
 koId: text("ko_id")
 .notNull()
 .references(() => knowledgeObjects.id, { onDelete: "cascade" }),
 sourceDocumentId: text("source_document_id").notNull(),
 sourceVersion: text("source_version").default("1.0").notNull(),
 chapterId: text("chapter_id").notNull(),
 startOffset: bigint("start_offset", { mode: "number" }).notNull(),
 endOffset: bigint("end_offset", { mode: "number" }).notNull(),
 sourceHash: text("source_hash").notNull(),
 excerptHash: text("excerpt_hash").notNull(),
 extractionRunId: text("extraction_run_id").references(() => extractionRuns.id, { onDelete: "set null" }),
 supportRole: text("support_role").$type<"core" | "prerequisite" | "enrichment" | "assessment_support" | "reference">().default("core").notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_ko_sources_ko").on(table.koId),
 index("idx_ko_sources_doc_chapter").on(table.sourceDocumentId, table.chapterId),
 ]
);

// 4d. learning_objectives
export const learningObjectives = pgTable(
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
 evidenceSourceIds: jsonb("evidence_source_ids").$defaultFn(() => []).notNull(),
 relatedKoIds: jsonb("related_ko_ids").$defaultFn(() => []).notNull(),
 status: text("status").$type<"active" | "superseded">().default("active").notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_learning_objectives_chapter").on(table.chapterId),
 ]
);

// 5. website_materials (Single Material per Chapter, M:N links removed)
export const websiteMaterials = pgTable(
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
 sourceMtdVersion: bigint("source_mtd_version", { mode: "number" }).notNull(),
 isStale: boolean("is_stale").default(false).notNull(),
 generationHash: text("generation_hash").notNull(),
 title: text("title").notNull(),
 slug: text("slug").notNull(),
 canonicalMarkdown: text("canonical_markdown").notNull(), // Markdown = editable
 structuredContent: jsonb("structured_content").notNull(), // AST = executable
 /** EIF E3: normalized term -> concept index, built at publish for the interactive material popover. */
 termIndex: jsonb("term_index")
 .$type<Array<{ term: string; conceptId: string; conceptName: string }>>(),
 contentVersion: bigint("content_version", { mode: "number" }).default(1).notNull(),
 status: text("status").default("draft").notNull(),
 coverageStatus: text("coverage_status")
    .$type<"not_verified" | "fully_covered" | "partially_covered" | "coverage_failed">()
    .default("not_verified")
    .notNull(),
  coverageReport: jsonb("coverage_report")
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
 thumbnailUrl: text("thumbnail_url"),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const websiteMaterialVersions = pgTable(
 "website_material_versions",
 {
 id: text("id").primaryKey(),
 materialId: text("material_id")
 .notNull()
 .references(() => websiteMaterials.id, { onDelete: "cascade" }),
 versionNumber: bigint("version_number", { mode: "number" }).notNull(),
 canonicalMarkdown: text("canonical_markdown").notNull(),
 structuredContent: jsonb("structured_content").notNull(),
 authorId: text("author_id")
 .references(() => user.id, { onDelete: "set null" }),
 changeSummary: text("change_summary"),
 isAiGenerated: boolean("is_ai_generated").default(false).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_web_mat_ver_mat").on(table.materialId),
 ]
);

// 6. vector_sync_queue (Transactional Outbox)
export const vectorSyncQueue = pgTable(
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
 payload: jsonb("payload").notNull(),
 status: text("status").$type<"pending" | "processing" | "completed" | "failed">().default("pending").notNull(),
 attempts: bigint("attempts", { mode: "number" }).default(0).notNull(),
 lastError: text("last_error"),
 leaseId: text("lease_id"),
 leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 index("idx_vector_sync_status").on(table.status),
 index("idx_vector_sync_lease").on(table.leaseExpiresAt),
 ]
);

// 7. flashcard_sets
export const flashcardSets = pgTable(
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
 sourceMtdVersion: bigint("source_mtd_version", { mode: "number" }).notNull(),
 isStale: boolean("is_stale").default(false).notNull(),
 generationHash: text("generation_hash").notNull(),
 title: text("title").notNull(),
 status: text("status").default("draft").notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 }
);

// 8. flashcards
export const flashcards = pgTable(
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
 metadata: jsonb("metadata").$defaultFn(() => ({})).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 }
);

// 9. student_flashcard_progress
export const studentFlashcardProgress = pgTable(
 "student_flashcard_progress",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 flashcardId: text("flashcard_id")
 .notNull()
 .references(() => flashcards.id, { onDelete: "cascade" }),
 easeFactor: doublePrecision("ease_factor").default(2.5).notNull(),
 intervalDays: bigint("interval_days", { mode: "number" }).default(0).notNull(),
 repetitions: bigint("repetitions", { mode: "number" }).default(0).notNull(),
 lapses: bigint("lapses", { mode: "number" }).default(0).notNull(),
 dueDate: timestamp("due_date", { withTimezone: true }).defaultNow().notNull(),
 lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const flashcardReviews = pgTable(
 "flashcard_reviews",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 flashcardId: text("flashcard_id")
 .notNull()
 .references(() => flashcards.id, { onDelete: "cascade" }),
 grade: bigint("grade", { mode: "number" }).notNull(), // 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
 responseTimeMs: bigint("response_time_ms", { mode: "number" }).notNull(),
 reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_fc_reviews_student").on(table.studentId),
 index("idx_fc_reviews_card").on(table.flashcardId),
 ]
);

// 9.6. student_material_progress
export const studentMaterialProgress = pgTable(
 "student_material_progress",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 materialId: text("material_id")
 .notNull()
 .references(() => websiteMaterials.id, { onDelete: "cascade" }),
 completionPercent: bigint("completion_percent", { mode: "number" }).default(0).notNull(), // range 0-100
 lastSectionId: text("last_section_id"), // Deprecated: use lastPosition instead
 lastPosition: jsonb("last_position").$type<{
   type: "pdf" | "article";
   page?: number;
   section?: string;
 }>(),
 timeSpentSeconds: bigint("time_spent_seconds", { mode: "number" }).default(0).notNull(), // accumulative
 lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }).defaultNow().notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 },
 (table) => [
 unique("uq_student_material").on(table.studentId, table.materialId),
 index("idx_student_mat_prog").on(table.studentId, table.materialId),
 ]
);

export const kemajuanBacaArtikel = pgTable(
 "kemajuan_baca_artikel",
 {
  id: text("id").primaryKey(),
  penggunaId: text("pengguna_id").notNull().references(() => pengguna.id, { onDelete: "cascade" }),
  artikelId: text("artikel_id").notNull().references(() => artikel.id, { onDelete: "cascade" }),
  artikelVersion: bigint("artikel_version", { mode: "number" }).notNull(),
  bagianArtikelId: text("bagian_artikel_id").notNull().references(() => bagianArtikel.id, { onDelete: "cascade" }),
  maxReadPercent: bigint("max_read_percent", { mode: "number" }).default(0).notNull(),
  timeSpentSeconds: bigint("time_spent_seconds", { mode: "number" }).default(0).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
 },
 (table) => [
  uniqueIndex("kemajuan_baca_artikel_unique_idx").on(table.penggunaId, table.artikelId, table.artikelVersion, table.bagianArtikelId),
  index("kemajuan_baca_artikel_resume_idx").on(table.penggunaId, table.artikelId, table.lastReadAt),
  check("kemajuan_baca_artikel_version_check", sql`${table.artikelVersion} > 0`),
  check("kemajuan_baca_artikel_percent_check", sql`${table.maxReadPercent} >= 0 AND ${table.maxReadPercent} <= 100`),
  check("kemajuan_baca_artikel_time_check", sql`${table.timeSpentSeconds} >= 0`),
 ],
);

// 10. diktats
export const diktats = pgTable(
 "diktats",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 sourceMtdId: text("source_mtd_id")
 .notNull()
 .references(() => masterTeachingDocuments.id, { onDelete: "cascade" }),
 sourceMtdVersion: bigint("source_mtd_version", { mode: "number" }).notNull(),
 isStale: boolean("is_stale").default(false).notNull(),
 generationHash: text("generation_hash").notNull(),
 title: text("title").notNull(),
 fileUrl: text("file_url"),
 chapterIds: jsonb("chapter_ids").notNull(),
 settings: jsonb("settings").$defaultFn(() => ({})).notNull(),
 status: text("status").default("draft").notNull(), // 'draft', 'generating', 'ready', 'failed'
 downloadCount: bigint("download_count", { mode: "number" }).default(0).notNull(),
 thumbnailUrl: text("thumbnail_url"),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
 .defaultNow()
 .$onUpdate(() => new Date())
 .notNull(),
 }
);

// 11. knowledge_relationships

export const knowledgeRelationships = pgTable(
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
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_rel_source").on(table.sourceKoId),
 index("idx_rel_target").on(table.targetKoId),
 index("idx_rel_source_target_type").on(table.sourceKoId, table.targetKoId, table.type),
 ]
);

// 11.4. assessment_sources
export const assessmentSources = pgTable("assessment_sources", {
  id: text("id").primaryKey(),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  origin: text("origin").$type<"uploaded" | "generated">().default("uploaded").notNull(),
  category: text("category").$type<"tutorial" | "quiz" | "uts" | "uas" | "tryout" | "homework" | "exercise" | "other">().notNull(),
  assessmentType: text("assessment_type").$type<"uts" | "uas" | "quiz" | "tutorial" | "homework" | "exercise" | "other">(),
  year: bigint("year", { mode: "number" }),
  institution: text("institution"),
  academicYearLabel: text("academic_year_label"),
  term: text("term"),
  canonicalCourseId: text("canonical_course_id").references(() => mataKuliah.id, { onDelete: "set null" }),
  sourceDocumentId: text("source_document_id").references(() => courseMaterials.id, { onDelete: "set null" }),
  solutionDocumentId: text("solution_document_id").references(() => courseMaterials.id, { onDelete: "set null" }),
  status: text("status").$type<"draft" | "in_review" | "published" | "retired">().default("draft").notNull(),
  semester: bigint("semester", { mode: "number" }),
  sourceMarkdown: text("source_markdown").notNull(),
  sourceHash: text("source_hash").notNull(),
  version: bigint("version", { mode: "number" }).default(1).notNull(),
  parserVersion: text("parser_version").default("1.0.0").notNull(),
  ingestionStatus: text("ingestion_status")
    .$type<"pending" | "processing" | "completed" | "failed">()
    .default("pending")
    .notNull(),
  ingestionError: text("ingestion_error"),
  ingestionStartedAt: timestamp("ingestion_started_at", { withTimezone: true }),
  ingestionCompletedAt: timestamp("ingestion_completed_at", { withTimezone: true }),
  originalFilename: text("original_filename"),
  uploadthingKey: text("uploadthing_key"),
  uploadedByUserId: text("uploaded_by_user_id")
    .notNull()
    .references(() => user.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedByUserId: text("deleted_by_user_id")
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [
  index("assessment_sources_canonical_course_idx").on(table.canonicalCourseId, table.status),
  index("assessment_sources_document_idx").on(table.sourceDocumentId, table.solutionDocumentId),
]);

// 11.4.5. assessment_source_chapters
export const assessmentSourceChapters = pgTable(
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
export const chapterAliases = pgTable("chapter_aliases", {
  id: text("id").primaryKey(),
  chapterId: text("chapter_id")
    .notNull()
    .references(() => chapters.id, { onDelete: "cascade" }),
  aliasName: text("alias_name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 11.5. assessment_objects
export const assessmentObjects = pgTable(
  "assessment_objects",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => assessmentSources.id, { onDelete: "cascade" }),
    questionOrder: bigint("question_order", { mode: "number" }).notNull(),
    sourceQuestionNumber: text("source_question_number"),
    questionType: text("question_type").notNull(),
    difficulty: bigint("difficulty", { mode: "number" }).notNull(),
    applicationLevel: bigint("application_level", { mode: "number" }).notNull(),
    pattern: text("pattern").notNull(),
    reasoningType: text("reasoning_type").notNull(),
    estimatedSteps: bigint("estimated_steps", { mode: "number" }).notNull(),
    questionMarkdown: text("question_markdown").default("").notNull(),
    answerMarkdown: text("answer_markdown"),
    options: jsonb("options").$type<string[]>(),
    canonicalQuestionHash: text("canonical_question_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  }
);

// Join table: Assessment Objects to Concepts (Concept-First Mapping)
export const assessmentObjectConcepts = pgTable(
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
export const assessmentObjectKos = pgTable(
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
export const assessmentProfiles = pgTable(
  "assessment_profiles",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .unique()
      .references(() => courses.id, { onDelete: "cascade" }),
    applicationLevel: bigint("application_level", { mode: "number" }).notNull(),
    difficultyDistribution: jsonb("difficulty_distribution")
      .$type<{ easy: number; medium: number; hard: number }>()
      .notNull(),
    commonPatterns: jsonb("common_patterns").$type<string[]>().notNull(),
    topContexts: jsonb("top_contexts")
      .$type<{ conceptName: string; percentage: number }[]>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  }
);

// 11.7. course_policies
export const coursePolicies = pgTable(
  "course_policies",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .unique()
      .references(() => courses.id, { onDelete: "cascade" }),
    maxApplicationLevel: bigint("max_application_level", { mode: "number" }).default(2).notNull(),
    maxEstimatedSteps: bigint("max_estimated_steps", { mode: "number" }).default(4).notNull(),
    maxReadingComplexity: bigint("max_reading_complexity", { mode: "number" }).default(2).notNull(),
    allowEngineeringTerms: boolean("allow_engineering_terms").default(true).notNull(),
    forbiddenContexts: jsonb("forbidden_contexts").$type<string[]>().notNull(),
    allowedPatterns: jsonb("allowed_patterns").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  }
);

// 12. course_materials (Uploaded PDF files: Materi, Soal, & Pembahasan Soal)
export const courseMaterials = pgTable(
	"course_materials",
	{
		id: text("id").primaryKey(),
		courseId: text("course_id")
			.notNull()
			.references(() => courses.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		type: text("type").$type<"materi" | "soal" | "pembahasan_soal" | "materi_kelas" | "contoh_soal">().notNull(),
		subcategory: text("subcategory").$type<
			| "materi_dosen"
			| "scl"
			| "modul"
			| "ebook"
			| "kuis"
			| "kbf"
			| "tutorial"
			| "uts"
			| "uas"
			| "up"
			| "ltm"
			| "lainnya"
		>(),
		year: bigint("year", { mode: "number" }),
		fileUrl: text("file_url").notNull(),
		checksum: text("checksum"),
		chapterIds: jsonb("chapter_ids").$type<string[]>().notNull(),
		thumbnailUrl: text("thumbnail_url"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("idx_course_materials_course").on(table.courseId),
	]
);

// 12.1. course_video_playlists
export const courseVideoPlaylists = pgTable(
	"course_video_playlists",
	{
		id: text("id").primaryKey(),
		courseId: text("course_id")
			.notNull()
			.references(() => courses.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		description: text("description"),
		orderIndex: bigint("order_index", { mode: "number" }).notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("idx_course_video_playlists_course").on(table.courseId),
	]
);

// 12.2. course_videos
export const courseVideos = pgTable(
	"course_videos",
	{
		id: text("id").primaryKey(),
		courseId: text("course_id")
			.notNull()
			.references(() => courses.id, { onDelete: "cascade" }),
		playlistId: text("playlist_id")
			.notNull()
			.references(() => courseVideoPlaylists.id, { onDelete: "cascade" }),
		chapterId: text("chapter_id")
			.references(() => chapters.id, { onDelete: "set null" }),
		title: text("title").notNull(),
		description: text("description"),
		videoUrl: text("video_url").notNull(),
		thumbnailUrl: text("thumbnail_url"),
		duration: bigint("duration", { mode: "number" }),
		fileSize: bigint("file_size", { mode: "number" }),
		orderIndex: bigint("order_index", { mode: "number" }).notNull().default(0),
		uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("idx_course_videos_course").on(table.courseId),
		index("idx_course_videos_playlist").on(table.playlistId),
		index("idx_course_videos_chapter").on(table.chapterId),
	]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const coursesRelations = relations(courses, ({ one, many }) => ({
	courseMaterials: many(courseMaterials),
	videoPlaylists: many(courseVideoPlaylists),
	videos: many(courseVideos),
	assessmentSources: many(assessmentSources),
	groupCourses: many(groupCourses),
	enrollments: many(enrollments),
	assessmentProfile: one(assessmentProfiles, {
		fields: [courses.id],
		references: [assessmentProfiles.courseId],
	}),
	coursePolicy: one(coursePolicies, {
		fields: [courses.id],
		references: [coursePolicies.courseId],
	}),
}));

export const courseVideoPlaylistsRelations = relations(courseVideoPlaylists, ({ one, many }) => ({
	course: one(courses, {
		fields: [courseVideoPlaylists.courseId],
		references: [courses.id],
	}),
	videos: many(courseVideos),
}));

export const courseVideosRelations = relations(courseVideos, ({ one }) => ({
	course: one(courses, {
		fields: [courseVideos.courseId],
		references: [courses.id],
	}),
	playlist: one(courseVideoPlaylists, {
		fields: [courseVideos.playlistId],
		references: [courseVideoPlaylists.id],
	}),
	chapter: one(chapters, {
		fields: [courseVideos.chapterId],
		references: [chapters.id],
	}),
	uploader: one(user, {
		fields: [courseVideos.uploadedBy],
		references: [user.id],
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
 videos: many(courseVideos),
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

export const aiUsageEvents = pgTable(
 "ai_usage_events",
 {
 id: text("id").primaryKey(),
 userId: text("user_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 feature: text("feature").notNull(), // 'tutor' | 'flashcards' | 'quiz' | 'diktat'
 model: text("model").notNull(), // e.g. 'gemini-3.1-flash-lite' | 'gemma-4-26b'
 tokens: bigint("tokens", { mode: "number" }).default(0).notNull(),
 inputTokens: bigint("input_tokens", { mode: "number" }).default(0).notNull(),
 outputTokens: bigint("output_tokens", { mode: "number" }).default(0).notNull(),
 requestType: text("request_type").notNull(), // 'explain_concept' | 'analyze_mistake'
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_usage_user_created").on(table.userId, table.createdAt),
 ]
);

export const aiGenerationTraces = pgTable(
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
    inputTokens: bigint("input_tokens", { mode: "number" }).default(0).notNull(),
    outputTokens: bigint("output_tokens", { mode: "number" }).default(0).notNull(),
    retryCount: bigint("retry_count", { mode: "number" }).default(0).notNull(),
    terminalOutcome: text("terminal_outcome").notNull(),
    violationCodes: text("violation_codes"),
    latencyMs: bigint("latency_ms", { mode: "number" }).default(0).notNull(),
    cacheResult: text("cache_result").default("none").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_traces_user_created").on(table.userId, table.createdAt),
    index("idx_traces_stage_prompt").on(table.stageId, table.promptVersion),
  ]
);

/**
 * Zyra application allowance leases. This is additive and authoritative only
 * while FEATURE_ZYRA_ALLOWANCE_V2 is enabled. Legacy AI usage remains intact.
 */
export const aiAllowanceLeases = pgTable(
  "ai_allowance_leases",
  {
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => pengguna.id, { onDelete: "restrict" }),
    peran: text("peran").$type<"admin" | "tutor" | "murid">().notNull(),
    accessTier: text("access_tier").$type<"standard" | "free">().default("standard").notNull(),
    feature: text("feature").notNull(),
    appDay: text("app_day").notNull(),
    units: bigint("units", { mode: "number" }).default(1).notNull(),
    interactionUnits: bigint("interaction_units", { mode: "number" }).default(1).notNull(),
    premium: boolean("premium").default(false).notNull(),
    status: text("status")
      .$type<"reserved" | "dispatched" | "committed" | "refunded">()
      .notNull(),
    controlPlaneLeaseId: text("control_plane_lease_id"),
    model: text("model"),
    requestType: text("request_type").notNull(),
    inputTokens: bigint("input_tokens", { mode: "number" }).default(0).notNull(),
    outputTokens: bigint("output_tokens", { mode: "number" }).default(0).notNull(),
    runId: text("run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ai_allowance_leases_idempotency_idx").on(table.idempotencyKey),
    index("ai_allowance_leases_user_day_idx").on(table.userId, table.appDay),
    index("ai_allowance_leases_user_tier_feature_day_idx").on(
      table.userId,
      table.accessTier,
      table.feature,
      table.appDay,
    ),
    index("ai_allowance_leases_user_status_idx").on(table.userId, table.status),
    index("ai_allowance_leases_control_plane_idx").on(table.controlPlaneLeaseId),
    index("ai_allowance_leases_run_idx").on(table.runId),
    check("ai_allowance_leases_units_check", sql`${table.units} >= 0`),
    check("ai_allowance_leases_interaction_units_check", sql`${table.interactionUnits} > 0`),
    check("ai_allowance_leases_access_tier_check", sql`${table.accessTier} IN ('standard', 'free')`),
    check("ai_allowance_leases_status_check", sql`${table.status} IN ('reserved', 'dispatched', 'committed', 'refunded')`),
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
export const userPushTokens = pgTable(
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
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const notifications = pgTable(
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
  read: boolean("read").default(false).notNull(),
  /** Arbitrary JSON payload (e.g. quizId, courseId, bookingId). */
  metadata: jsonb("metadata").$defaultFn(() => ({})).notNull(),
  /** FCM delivery stats for the push attempt to this user's devices. */
  attempted: bigint("attempted", { mode: "number" }).default(0).notNull(),
  succeeded: bigint("succeeded", { mode: "number" }).default(0).notNull(),
  failedCount: bigint("failed_count", { mode: "number" }).default(0).notNull(),
  /** When the push attempt happened; null when the user had no registered device. */
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_notifications_user_read").on(table.userId, table.read),
 index("idx_notifications_user_created").on(table.userId, table.createdAt),
 ]
);

// ─── P1A: Mastery Foundation ──────────────────────────────────────────────────

// learning_events ; append-only event log; recompute worker reads this
export const learningEvents = pgTable(
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
 correctness: doublePrecision("correctness"),
 weight: doublePrecision("weight").default(1).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
 index("idx_le_student_course_created").on(table.studentId, table.courseId, table.createdAt),
 index("idx_le_student_concept").on(table.studentId, table.conceptName),
 ]
);

// Zyra personalization stores only bounded presentation evidence. It never
// replaces mastery, grades, attempts, or assessment policy.
export const zyraLearnerProfiles = pgTable(
 "zyra_learner_profiles",
 {
  id: text("id").primaryKey(),
  studentId: text("student_id")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id")
   .notNull()
   .references(() => courses.id, { onDelete: "cascade" }),
  profileVersion: text("profile_version").notNull().default("zyra-personalization-v1"),
  inferredPace: text("inferred_pace")
   .$type<"unknown" | "slow" | "standard" | "fast">()
   .notNull()
   .default("unknown"),
  inferredRepresentation: text("inferred_representation")
   .$type<"unknown" | "text" | "visual" | "stepwise" | "example" | "mixed">()
   .notNull()
   .default("unknown"),
  supportIntensity: text("support_intensity")
   .$type<"unknown" | "light" | "standard" | "high">()
   .notNull()
   .default("unknown"),
  explanationLength: text("explanation_length")
   .$type<"unknown" | "concise" | "standard" | "detailed">()
   .notNull()
   .default("unknown"),
  checkpointType: text("checkpoint_type")
   .$type<"unknown" | "free_text" | "teach_back" | "choice">()
   .notNull()
   .default("unknown"),
  confidence: doublePrecision("confidence").notNull().default(0),
  evidenceCount: bigint("evidence_count", { mode: "number" }).notNull().default(0),
  reasonCodes: jsonb("reason_codes")
   .$type<string[]>()
   .$defaultFn(() => [])
   .notNull(),
  lastEvidenceAt: timestamp("last_evidence_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  resetAt: timestamp("reset_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
   .defaultNow()
   .$onUpdate(() => new Date())
   .notNull(),
 },
 (table) => [
  unique("uq_zyra_profile_student_course").on(table.studentId, table.courseId),
  index("idx_zyra_profile_student_course").on(table.studentId, table.courseId),
  index("idx_zyra_profile_expiry").on(table.expiresAt),
 ],
);

export const zyraLearnerPreferences = pgTable(
 "zyra_learner_preferences",
 {
  id: text("id").primaryKey(),
  studentId: text("student_id")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id")
   .notNull()
   .references(() => courses.id, { onDelete: "cascade" }),
  pace: text("pace")
   .$type<"slow" | "standard" | "fast">(),
  representation: text("representation")
   .$type<"text" | "visual" | "stepwise" | "example" | "mixed">(),
  explanationLength: text("explanation_length")
   .$type<"concise" | "standard" | "detailed">(),
  checkpointType: text("checkpoint_type")
   .$type<"free_text" | "teach_back" | "choice">(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
   .defaultNow()
   .$onUpdate(() => new Date())
   .notNull(),
 },
 (table) => [
  unique("uq_zyra_preferences_student_course").on(table.studentId, table.courseId),
  index("idx_zyra_preferences_student_course").on(table.studentId, table.courseId),
 ],
);

export const zyraLearningEvents = pgTable(
 "zyra_learning_events",
 {
  id: text("id").primaryKey(),
  studentId: text("student_id")
   .notNull()
   .references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id")
   .notNull()
   .references(() => courses.id, { onDelete: "cascade" }),
  ideaId: text("idea_id").references(() => ide.id, { onDelete: "set null" }),
  eventKind: text("event_kind")
   .$type<
    | "tutor_question"
    | "hint_requested"
    | "checkpoint_answered"
    | "teach_back"
    | "flashcard_review"
    | "quiz_answer"
    | "material_completed"
   >()
   .notNull(),
  sourceType: text("source_type")
   .$type<"tutor" | "flashcard" | "quiz" | "material" | "explicit">()
   .notNull(),
  evidenceRef: text("evidence_ref"),
  outcome: text("outcome").$type<"success" | "failure" | "neutral" | "unknown">(),
  correctness: doublePrecision("correctness"),
  responseLatencyBucket: text("response_latency_bucket")
   .$type<"very_fast" | "fast" | "standard" | "slow" | "unknown">()
   .notNull()
   .default("unknown"),
  hintLevel: text("hint_level")
   .$type<"none" | "hint_1" | "hint_2" | "hint_3" | "hint_4" | "unknown">()
   .notNull()
   .default("unknown"),
  representation: text("representation")
   .$type<"text" | "visual" | "stepwise" | "example" | "mixed" | "unknown">()
   .notNull()
   .default("unknown"),
  weight: doublePrecision("weight").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
 },
 (table) => [
  index("idx_zyra_event_student_course_created").on(table.studentId, table.courseId, table.createdAt),
  index("idx_zyra_event_student_course_kind").on(table.studentId, table.courseId, table.eventKind),
  index("idx_zyra_event_idea").on(table.ideaId),
 ],
);

// student_concept_mastery ; one row per (student, course, concept)
export const studentConceptMastery = pgTable(
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
 masteryScore: bigint("mastery_score", { mode: "number" }).notNull(),
 confidence: bigint("confidence", { mode: "number" }).notNull(),
 evidenceCount: bigint("evidence_count", { mode: "number" }).notNull(),
 trend: text("trend").$type<"improving" | "stable" | "declining">(),
 lastEvidenceAt: timestamp("last_evidence_at", { withTimezone: true }).notNull(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const studentConceptMasteryHistory = pgTable(
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
 masteryScore: bigint("mastery_score", { mode: "number" }).notNull(),
 confidence: bigint("confidence", { mode: "number" }).notNull(),
 snapshotDate: text("snapshot_date").notNull(), // yyyy-mm-dd
 },
 (table) => [
 unique("uq_scmh_student_concept_date").on(table.studentId, table.conceptName, table.snapshotDate),
 index("idx_scmh_student_course").on(table.studentId, table.courseId),
 ]
);

// ─── P2: Streak + Daily Recommendations ──────────────────────────────────────

export const studentStreaks = pgTable("student_streaks", {
 studentId: text("student_id")
 .primaryKey()
 .references(() => user.id, { onDelete: "cascade" }),
 currentStreak: bigint("current_streak", { mode: "number" }).default(0).notNull(),
 longestStreak: bigint("longest_streak", { mode: "number" }).default(0).notNull(),
 lastActiveDate: text("last_active_date").notNull(), // yyyy-mm-dd (UTC)
});

export const dailyRecommendations = pgTable(
 "daily_recommendations",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 date: text("date").notNull(), // yyyy-mm-dd (UTC)
 payload: jsonb("payload").notNull(),
 completedItems: jsonb("completed_items")
 .$defaultFn(() => [])
 .notNull(),
 generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => [
 unique("uq_daily_rec_student_date").on(table.studentId, table.date),
 index("idx_daily_rec_student").on(table.studentId),
 ]
);

// ─── P3: Tutor session memory ────────────────────────────────────────────────

// tutor_session_summaries ; one row per (student, course), deterministic update after each tutor exchange
export const tutorSessionSummaries = pgTable(
  "tutor_session_summaries",
  {
  id: text("id").primaryKey(),
  studentId: text("student_id")
  .notNull()
  .references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id")
  .notNull()
  .references(() => courses.id, { onDelete: "cascade" }),
  askedConcepts: jsonb("asked_concepts")
  .$defaultFn(() => [])
  .notNull(),
  questionCount: bigint("question_count", { mode: "number" }).default(0).notNull(),
  lastSessionAt: timestamp("last_session_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
  unique("uq_tss_student_course").on(table.studentId, table.courseId),
  ]
);

// ─── P3A: Chat Sessions & Sources ────────────────────────────────────────────

// chat_sessions ; groups conversations into named sessions per (student, course)
export const chatSessions = pgTable(
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
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const tutorChatMessages = pgTable(
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
  sources: jsonb("sources"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
  index("idx_tcm_student_course").on(table.studentId, table.courseId),
  index("idx_tcm_session").on(table.sessionId),
  index("idx_tcm_created_at").on(table.createdAt),
  ]
);

// chat_message_sources ; tracks which sources were used to generate an AI answer
export const chatMessageSources = pgTable(
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
  relevanceScore: doublePrecision("relevance_score").default(1.0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_cms_message").on(table.messageId),
    index("idx_cms_source").on(table.sourceType, table.sourceId),
  ]
);

// Zyra Plan 010 ; sanitized private learner image attachments. Source bytes are never stored.
export const zyraMessageAttachments = pgTable(
  "zyra_message_attachments",
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
    messageId: text("message_id")
      .references(() => tutorChatMessages.id, { onDelete: "set null" }),
    objectKey: text("object_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    width: bigint("width", { mode: "number" }).notNull(),
    height: bigint("height", { mode: "number" }).notNull(),
    sanitizedSha256: text("sanitized_sha256").notNull(),
    sanitizerVersion: text("sanitizer_version").notNull(),
    status: text("status", {
      enum: ["uploaded", "attached", "dispatched", "deleted", "expired", "failed"],
    }).notNull().default("uploaded"),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    providerDispatchedAt: timestamp("provider_dispatched_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_zyra_attachment_owner_scope").on(table.studentId, table.courseId, table.sessionId),
    index("idx_zyra_attachment_expiry").on(table.expiresAt, table.status),
    index("idx_zyra_attachment_message").on(table.messageId),
  ],
);

// Zyra Plan 012 ; proposal-only copilot records. Operations remain typed data,
// never executable model text. Applying them requires a separate mutation boundary.
export const zyraProposals = pgTable(
  "zyra_proposals",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<"tutor" | "admin">().notNull(),
    proposalType: text("proposal_type").notNull(),
    courseId: text("course_id").references(() => courses.id, { onDelete: "set null" }),
    scope: jsonb("scope").$type<Record<string, unknown>>().notNull(),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull(),
    preconditionSnapshot: jsonb("precondition_snapshot").$type<Record<string, unknown>>().notNull(),
    operations: jsonb("operations").$type<unknown[]>().notNull(),
    learnerImpact: jsonb("learner_impact").$type<Record<string, unknown>>().notNull(),
    reversibility: jsonb("reversibility").$type<Record<string, unknown>>().notNull(),
    warnings: jsonb("warnings").$type<string[]>().notNull(),
    proposerTrace: jsonb("proposer_trace").$type<Record<string, unknown>>().notNull(),
    validatorResult: jsonb("validator_result").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<"draft" | "validated" | "reviewed" | "confirmed" | "applied" | "rejected" | "expired" | "failed">().notNull().default("draft"),
    preconditionVersion: bigint("precondition_version", { mode: "number" }).notNull(),
    diffHash: text("diff_hash").notNull(),
    auditId: text("audit_id"),
    failureCode: text("failure_code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("idx_zyra_proposal_actor_status").on(table.actorId, table.status, table.createdAt),
    index("idx_zyra_proposal_course_status").on(table.courseId, table.status),
    index("idx_zyra_proposal_expiry").on(table.expiresAt, table.status),
  ],
);

export const zyraProposalEvents = pgTable(
  "zyra_proposal_events",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id").notNull().references(() => zyraProposals.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    reasonCode: text("reason_code").notNull(),
    diffHash: text("diff_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_zyra_proposal_event_proposal").on(table.proposalId, table.createdAt),
    index("idx_zyra_proposal_event_actor").on(table.actorId, table.createdAt),
  ],
);

// Zyra Plan 013 ; fixed-column operational telemetry only. No prompts,
// responses, object keys, full hashes, or identity-bearing metadata are stored.
export const zyraOperationalEvents = pgTable(
  "zyra_operational_events",
  {
    id: text("id").primaryKey(),
    eventVersion: text("event_version").notNull(),
    eventType: text("event_type").notNull(),
    actorRole: text("actor_role").$type<"admin" | "tutor" | "murid" | "system" | "unknown">().notNull(),
    routeClass: text("route_class").notNull(),
    modelClass: text("model_class").notNull(),
    projectFingerprint: text("project_fingerprint"),
    courseFingerprint: text("course_fingerprint"),
    resultCode: text("result_code").notNull(),
    latencyBucket: text("latency_bucket").notNull(),
    sizeBucket: text("size_bucket").notNull(),
    cacheResult: text("cache_result").notNull(),
    attachmentCount: bigint("attachment_count", { mode: "number" }).notNull().default(0),
    sanitizerVersion: text("sanitizer_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_zyra_ops_event_type_created").on(table.eventType, table.createdAt),
    index("idx_zyra_ops_route_created").on(table.routeClass, table.createdAt),
  ],
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
export const attemptFeedback = pgTable(
 "attempt_feedback",
 {
 id: text("id").primaryKey(),
 attemptId: text("attempt_id")
 .notNull()
 .references(() => studentQuizAttempts.id, { onDelete: "cascade" }),
 questionIndex: bigint("question_index", { mode: "number" }).notNull(),
 payload: jsonb("payload").notNull(),
 },
 (table) => [
 unique("uq_attempt_feedback_question").on(table.attemptId, table.questionIndex),
 ]
);

export const interventions = pgTable(
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
 payload: jsonb("payload").notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 resolvedAt: timestamp("resolved_at", { withTimezone: true }),
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
export const studyPaths = pgTable(
 "study_paths",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 pathJson: jsonb("path_json").notNull(),
 computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
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
export const courseAnalyticsSnapshots = pgTable(
 "course_analytics_snapshots",
 {
 id: text("id").primaryKey(),
 courseId: text("course_id")
 .notNull()
 .references(() => courses.id, { onDelete: "cascade" }),
 date: text("date").notNull(), // yyyy-mm-dd
 payload: jsonb("payload").notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export const liveQuizSessions = pgTable(
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
 questionsSnapshot: jsonb("questions_snapshot").notNull(),
 participantCount: bigint("participant_count", { mode: "number" }).default(0).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 endedAt: timestamp("ended_at", { withTimezone: true }),
 deliveryStatus: text("delivery_status")
   .$type<"pending" | "processing" | "delivered" | "failed">()
   .default("pending")
   .notNull(),
 deliveryClaimedAt: timestamp("delivery_claimed_at", { withTimezone: true }),
 deliveryClaimToken: text("delivery_claim_token"),
 deliveredAt: timestamp("delivered_at", { withTimezone: true }),
 },
 (table) => [
 index("idx_live_sessions_code").on(table.code),
 index("idx_live_sessions_course").on(table.courseId),
 ]
);

export const liveQuizResults = pgTable(
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
 score: bigint("score", { mode: "number" }).default(0).notNull(),
 rank: bigint("rank", { mode: "number" }),
 answersSnapshot: jsonb("answers_snapshot").notNull(),
 completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
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

export const weeklyReflections = pgTable(
 "weekly_reflections",
 {
 id: text("id").primaryKey(),
 studentId: text("student_id")
 .notNull()
 .references(() => user.id, { onDelete: "cascade" }),
 weekStart: text("week_start").notNull(), // yyyy-mm-dd (Monday)
 payload: jsonb("payload").$type<{
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
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export const aiExtractionFailures = pgTable(
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
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
export const conceptGraphEdges = pgTable(
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
export const studentChapterMastery = pgTable(
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
    masteryScore: bigint("mastery_score", { mode: "number" }).notNull(),
    confidence: doublePrecision("confidence").notNull(),
    evidenceCount: bigint("evidence_count", { mode: "number" }).notNull(),
    trend: text("trend").$type<"improving" | "stable" | "declining">(),
    lastEvidenceAt: timestamp("last_evidence_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const masteryRecomputeQueue = pgTable(
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
    retries: bigint("retries", { mode: "number" }).default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const learningOutcomes = pgTable(
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const learningOutcomeConcepts = pgTable(
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
export const contentQualityFlags = pgTable(
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
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull(),
    sampleSize: bigint("sample_size", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
export const careerPathTemplates = pgTable(
  "career_path_templates",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [unique("uq_career_path_templates_title").on(table.title)]
);

export const careerPathConcepts = pgTable(
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
export const pkaSimulationStages = pgTable(
  "pka_simulation_stages",
  {
    id: text("id").primaryKey(),
    subject: text("subject").$type<"matematika" | "fisika" | "kimia">().notNull(),
    stage: bigint("stage", { mode: "number" }).notNull(), // 1, 2, or 3
    quizTemplateId: text("quiz_template_id")
      .notNull()
      .references(() => quizTemplates.id, { onDelete: "cascade" }),
    passScoreThreshold: bigint("pass_score_threshold", { mode: "number" }).notNull(), // 0-100
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_pka_stages_subject_stage").on(table.subject, table.stage),
  ]
);

// Per-student gating state machine for the simulation.
export const pkaStageProgress = pgTable(
  "pka_stage_progress",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    subject: text("subject").$type<"matematika" | "fisika" | "kimia">().notNull(),
    stage: bigint("stage", { mode: "number" }).notNull(),
    status: text("status").$type<"locked" | "unlocked" | "completed" | "skipped">().default("locked").notNull(),
    bestScore: bigint("best_score", { mode: "number" }),
    passed: boolean("passed"),
    attemptId: text("attempt_id").references(() => studentQuizAttempts.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_pka_progress_student_subject_stage").on(table.studentId, table.subject, table.stage),
  ]
);

// Admin-authored Google Meet review session broadcasts.
export const pkaAnnouncements = pgTable("pka_announcements", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  recipientCount: bigint("recipient_count", { mode: "number" }),
  isArchived: boolean("is_archived").default(false).notNull(),
  isPinned: boolean("is_pinned").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pkaAnnouncementReads = pgTable(
  "pka_announcement_reads",
  {
    announcementId: text("announcement_id")
      .notNull()
      .references(() => pkaAnnouncements.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.announcementId, table.userId] }),
  ]
);

export const pkaSchedules = pgTable("pka_schedules", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  sessionAt: timestamp("session_at", { withTimezone: true }).notNull(),
  meetLink: text("meet_link"), // Optional link
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  recipientCount: bigint("recipient_count", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Gated enrollment intake: incoming students fill this form (name, faculty,
// account email, Instagram follow proof) before an enrollment row is created.
// receiveAnnouncements remains a legacy fallback for existing rows and still
// controls push delivery. Central preferences govern optional email delivery.
// One row per user (uniqueIndex on user_id).
export const pkaRegistrations = pgTable(
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
    receiveAnnouncements: boolean("receive_announcements")
      .default(true)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export const shortLink = pgTable("short_link", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  url: text("url").notNull(),
  title: text("title"),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }), // Creator
  clicks: bigint("clicks", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const shortLinkRelations = relations(shortLink, ({ one }) => ({
  creator: one(user, {
    fields: [shortLink.userId],
    references: [user.id],
  }),
}));

/** Master Google Meet session persistence table for titles & space metadata. */
export const googleMeetSessions = pgTable(
  "google_meet_sessions",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    spaceName: text("space_name").notNull().unique(),
    meetingUri: text("meeting_uri").notNull(),
    meetingCode: text("meeting_code").notNull(),
    accessType: text("access_type").$type<"OPEN" | "TRUSTED" | "RESTRICTED">().default("OPEN").notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    slug: text("slug").unique(),
    hostEmail: text("host_email"),
    coHostEmails: jsonb("co_host_emails").$type<string[]>(),
    invitedEmails: jsonb("invited_emails").$type<string[]>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_meet_space_name").on(table.spaceName),
    index("idx_meet_code").on(table.meetingCode),
    index("idx_meet_slug").on(table.slug),
  ]
);

export const googleMeetSessionsRelations = relations(googleMeetSessions, ({ one }) => ({
  creator: one(user, {
    fields: [googleMeetSessions.createdById],
    references: [user.id],
  }),
}));

// ─── Analytics ────────────────────────────────────────────────────────────
// Synchronization of GA4 popular pages cache

/** Master Google Forms table for custom form builder & response analytics. */
export const googleForms = pgTable(
  "google_forms",
  {
    id: text("id").primaryKey(),
    formId: text("form_id").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    responderUri: text("responder_uri").notNull(),
    editUri: text("edit_uri"),
    category: text("category").$type<"survey" | "quiz" | "feedback" | "registration">().default("survey").notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_forms_form_id").on(table.formId),
    index("idx_forms_category").on(table.category),
  ]
);

export const googleFormsRelations = relations(googleForms, ({ one }) => ({
  creator: one(user, {
    fields: [googleForms.createdById],
    references: [user.id],
  }),
}));

/** Native Zyx Custom Forms table supporting 12 question types, short links, and native uploads. */
export const customForms = pgTable(
  "custom_forms",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").$type<"survey" | "quiz" | "feedback" | "registration">().default("survey").notNull(),
    questions: jsonb("questions").$type<any[]>().notNull(),
    settings: jsonb("settings").$type<{
      acceptingResponses?: boolean;
      closedMessage?: string;
      openAt?: string;
      closeAt?: string;
      collectEmail?: "none" | "input" | "verified";
      limitToOneResponse?: boolean;
      requireLogin?: boolean;
      allowResponseEditing?: boolean;
      sendResponseCopy?: "off" | "requested" | "always";
      maxFileSizeLimit?: "1GB" | "10GB" | "100GB";
      shuffleQuestions?: boolean;
      customSuccessMessage?: string;
    }>(),
    googleFormId: text("google_form_id"),
    googleResponderUri: text("google_responder_uri"),
    spreadsheetId: text("spreadsheet_id"),
    spreadsheetUrl: text("spreadsheet_url"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_custom_forms_slug").on(table.slug),
    index("idx_custom_forms_category").on(table.category),
  ]
);

export const customFormsRelations = relations(customForms, ({ one, many }) => ({
  creator: one(user, {
    fields: [customForms.createdById],
    references: [user.id],
  }),
  responses: many(customFormResponses),
}));

/** Native Zyx Custom Form Responses table storing submissions & file attachments. */
export const customFormResponses = pgTable(
  "custom_form_responses",
  {
    id: text("id").primaryKey(),
    formId: text("form_id")
      .notNull()
      .references(() => customForms.id, { onDelete: "cascade" }),
    responderUserId: text("responder_user_id").references(() => user.id, { onDelete: "set null" }),
    responderEmail: text("responder_email"),
    answers: jsonb("answers").$type<Record<string, any>>().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_custom_form_responses_form_id").on(table.formId),
    index("idx_custom_form_responses_user_id").on(table.responderUserId),
  ]
);

export const customFormResponsesRelations = relations(customFormResponses, ({ one }) => ({
  form: one(customForms, {
    fields: [customFormResponses.formId],
    references: [customForms.id],
  }),
  responderUser: one(user, {
    fields: [customFormResponses.responderUserId],
    references: [user.id],
  }),
}));

/** Reusable Form Studio presets (question blueprints + settings) that admins can save and re-apply. */
export const customFormPresets = pgTable(
  "custom_form_presets",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").$type<"survey" | "quiz" | "feedback" | "registration">().default("survey").notNull(),
    questions: jsonb("questions").$type<any[]>().notNull(),
    settings: jsonb("settings").$type<Record<string, any>>(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_custom_form_presets_category").on(table.category),
  ]
);

export const customFormPresetsRelations = relations(customFormPresets, ({ one }) => ({
  creator: one(user, {
    fields: [customFormPresets.createdById],
    references: [user.id],
  }),
}));

/** Curated important links library (Tautan) managed by admins for quick access. */
export const importantLinks = pgTable(
  "important_links",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    icon: text("icon"),
    category: text("category"),
    color: text("color"),
    sortOrder: bigint("sort_order", { mode: "number" }).default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_important_links_category").on(table.category),
    index("idx_important_links_active").on(table.isActive),
  ]
);

export const importantLinksRelations = relations(importantLinks, ({ one }) => ({
  creator: one(user, {
    fields: [importantLinks.createdById],
    references: [user.id],
  }),
}));

export const pageAnalytics = pgTable("page_analytics", {
  id: text("id").primaryKey(), // The path of the page, e.g., "/courses"
  title: text("title").notNull(),
  views: bigint("views", { mode: "number" }).default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Blog ───────────────────────────────────────────────────────────────────

export const blogArticles = pgTable(
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
    readMinutes: bigint("read_minutes", { mode: "number" }).default(5).notNull(),
    tags: jsonb("tags").$type<string[]>().$defaultFn(() => []),
    status: text("status").$type<"draft" | "published" | "scheduled">().default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdById: text("created_by_id")
      .references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const exportSpreadsheets = pgTable(
  "export_spreadsheets",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").$type<"form" | "quiz" | "pka" | "system">().notNull(),
    entityId: text("entity_id").notNull(),
    spreadsheetId: text("spreadsheet_id").notNull(),
    spreadsheetUrl: text("spreadsheet_url").notNull(),
    driveFolderId: text("drive_folder_id").notNull(),
    folderPath: text("folder_path").notNull(),
    lastHeaderCount: bigint("last_header_count", { mode: "number" }).notNull().default(0),
    lastRowCount: bigint("last_row_count", { mode: "number" }).notNull().default(0),
    lastWrittenFingerprint: text("last_written_fingerprint"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("export_spreadsheets_entity_idx").on(table.entityType, table.entityId),
  ]
);

export const searchDocuments = pgTable(
  "search_documents",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type")
      .$type<"course" | "chapter" | "material" | "quiz" | "exam" | "blog" | "nav" | "form" | "group" | "meet" | "user" | "token" | "schedule">()
      .notNull(),
    entityId: text("entity_id"),
    courseId: text("course_id"),
    title: text("title").notNull(),
    searchableText: text("searchable_text").notNull(),
    path: text("path").notNull(),
    minRole: bigint("min_role", { mode: "number" }).default(0).notNull(),
    isSynced: boolean("is_synced").default(false).notNull(),
    syncStatus: text("sync_status").$type<"pending" | "processing" | "completed" | "failed">().default("pending").notNull(),
    leaseId: text("lease_id"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_search_documents_entity").on(table.entityType, table.entityId),
    index("idx_search_documents_synced").on(table.isSynced),
    index("idx_search_documents_sync_status").on(table.syncStatus),
    index("idx_search_documents_min_role").on(table.minRole),
    index("idx_search_documents_course").on(table.courseId),
  ]
);

// ─── Admin Ops Knowledge ───────────────────────────────────────────────────

export const adminOpsKnowledgeSources = pgTable(
  "admin_ops_knowledge_sources",
  {
    id: text("id").primaryKey(),
    sourcePath: text("source_path").notNull(),
    sourceType: text("source_type")
      .$type<"doc" | "schema_projection" | "catalog" | "bundle_contract" | "runbook">()
      .notNull(),
    title: text("title").notNull(),
    version: bigint("version", { mode: "number" }).default(1).notNull(),
    contentHash: text("content_hash").notNull(),
    manifestHash: text("manifest_hash").notNull(),
    chunkCount: bigint("chunk_count", { mode: "number" }).default(0).notNull(),
    status: text("status").$type<"active" | "stale" | "archived">().default("active").notNull(),
    metadata: jsonb("metadata"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_admin_ops_sources_path").on(table.sourcePath),
    index("idx_admin_ops_sources_status").on(table.status),
    index("idx_admin_ops_sources_hash").on(table.contentHash),
  ]
);

export const adminOpsKnowledgeChunks = pgTable(
  "admin_ops_knowledge_chunks",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => adminOpsKnowledgeSources.id, { onDelete: "cascade" }),
    chunkIndex: bigint("chunk_index", { mode: "number" }).notNull(),
    locator: text("locator").notNull(),
    headingHierarchy: jsonb("heading_hierarchy")
      .$type<string[]>()
      .default([])
      .notNull(),
    startOffset: bigint("start_offset", { mode: "number" }).notNull(),
    endOffset: bigint("end_offset", { mode: "number" }).notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    version: bigint("version", { mode: "number" }).default(1).notNull(),
    status: text("status").$type<"active" | "stale">().default("active").notNull(),
    vectorId: text("vector_id").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_admin_ops_chunks_source").on(table.sourceId),
    index("idx_admin_ops_chunks_status").on(table.status),
    index("idx_admin_ops_chunks_vector_id").on(table.vectorId),
    index("idx_admin_ops_chunks_content_hash").on(table.contentHash),
    uniqueIndex("idx_admin_ops_chunks_source_index_ver").on(
      table.sourceId,
      table.chunkIndex,
      table.version
    ),
  ]
);

export const adminOpsKnowledgeSyncQueue = pgTable(
  "admin_ops_knowledge_sync_queue",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").references(() => adminOpsKnowledgeSources.id, {
      onDelete: "set null",
    }),
    action: text("action")
      .$type<"sync_source" | "sync_all" | "delete_source">()
      .notNull(),
    status: text("status")
      .$type<"pending" | "processing" | "completed" | "failed">()
      .default("pending")
      .notNull(),
    payload: jsonb("payload").notNull(),
    attempts: bigint("attempts", { mode: "number" }).default(0).notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_admin_ops_sync_queue_status").on(table.status),
  ]
);

export const adminOpsKnowledgeSourcesRelations = relations(
  adminOpsKnowledgeSources,
  ({ many }) => ({
    chunks: many(adminOpsKnowledgeChunks),
    syncActions: many(adminOpsKnowledgeSyncQueue),
  })
);

export const adminOpsKnowledgeChunksRelations = relations(
  adminOpsKnowledgeChunks,
  ({ one }) => ({
    source: one(adminOpsKnowledgeSources, {
      fields: [adminOpsKnowledgeChunks.sourceId],
      references: [adminOpsKnowledgeSources.id],
    }),
  })
);

export const adminOpsKnowledgeSyncQueueRelations = relations(
  adminOpsKnowledgeSyncQueue,
  ({ one }) => ({
    source: one(adminOpsKnowledgeSources, {
      fields: [adminOpsKnowledgeSyncQueue.sourceId],
      references: [adminOpsKnowledgeSources.id],
    }),
  })
);

/** Versioned private coding problems. Only the explicit public projection reaches students. */
export const codingProblems = pgTable("coding_problems", {
 id: text("id").notNull(),
 version: bigint("version", { mode: "number" }).notNull(),
 courseId: text("course_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
 status: text("status").$type<"draft" | "published">().notNull().default("draft"),
 snapshot: jsonb("snapshot").$type<import("@/lib/coding/contracts").CodingProblemPrivate>().notNull(),
 creatorId: text("creator_id").notNull().references(() => user.id, { onDelete: "restrict" }),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
 primaryKey({ columns: [table.id, table.version] }),
 index("coding_problems_course_status_idx").on(table.courseId, table.status),
 check("coding_problems_version_check", sql`${table.version} > 0`),
 check("coding_problems_status_check", sql`${table.status} IN ('draft', 'published')`),
]);

export const codingAttempts = pgTable("coding_attempts", {
 id: text("id").primaryKey(),
 learnerId: text("learner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
 problemId: text("problem_id").notNull(),
 problemVersion: bigint("problem_version", { mode: "number" }).notNull(),
 surface: text("surface").$type<"article" | "live_quiz">().notNull(),
 surfaceId: text("surface_id").notNull(),
 requestId: text("request_id").notNull(),
 ordinal: bigint("ordinal", { mode: "number" }).notNull(),
 request: jsonb("request").$type<import("@/lib/coding/contracts").CodingSubmissionRequest>().notNull(),
 evaluation: jsonb("evaluation").$type<import("@/lib/coding/contracts").CodingEvaluation>(),
 status: text("status").$type<"pending" | "completed" | "failed">().notNull().default("pending"),
 leaseToken: text("lease_token").notNull(),
 leaseExpiresAt: bigint("lease_expires_at", { mode: "number" }).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
 uniqueIndex("coding_attempt_request_idx").on(table.learnerId, table.surface, table.surfaceId, table.requestId),
 index("coding_attempt_history_idx").on(table.learnerId, table.problemId, table.problemVersion),
 check("coding_attempt_status_check", sql`${table.status} IN ('pending', 'completed', 'failed')`),
 check("coding_attempt_surface_check", sql`${table.surface} IN ('article', 'live_quiz')`),
 check("coding_attempt_ordinal_check", sql`${table.ordinal} > 0`),
]);

export const codingDrafts = pgTable("coding_drafts", {
 learnerId: text("learner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
 courseId: text("course_id").notNull().references(() => mataKuliah.id, { onDelete: "restrict" }),
 draftKey: text("draft_key").notNull(),
 code: text("code").notNull(),
 stdin: text("stdin").notNull().default(""),
 revision: bigint("revision", { mode: "number" }).notNull().default(1),
 updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.learnerId, table.courseId, table.draftKey] })]);

/** Durable admin external-operation outbox. Running attempts are never automatically replayed. */
export const adminOperationJobs = pgTable("admin_operation_jobs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull().references(() => pengguna.id, { onDelete: "restrict" }),
  sessionId: text("session_id").notNull(),
  kind: text("kind").$type<"notification_send" | "form_sheet" | "meet_create" | "meet_end" | "generation_start" | "media_upload">().notNull(),
  requiredScope: text("required_scope").notNull(),
  environment: text("environment").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").$type<"queued" | "running" | "succeeded" | "failed" | "unknown" | "cancelled">().default("queued").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, table => [index("admin_operation_jobs_queue_idx").on(table.status, table.createdAt), index("admin_operation_jobs_actor_idx").on(table.actorId, table.createdAt)]);
