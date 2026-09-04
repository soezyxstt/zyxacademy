import { db } from "@/db";
import {
  user,
  pengguna,
  penggunaPeran,
  peran,
  notifications,
  pkaRegistrations,
  pkaAnnouncements,
  pkaSchedules,
  customForms,
  customFormResponses,
  blogArticles,
  shortLink,
  aiGenerationJobs,
} from "@/db/schema";
import { eq, and, desc, inArray, like, count } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getAllFeatureFlagsStatus, KNOWN_FEATURE_FLAGS } from "@/lib/feature-flags";
import { membershipIdFor, peranIdFor, type PeranCode } from "@/lib/auth/peran";
import { sendAdminBroadcast } from "@/lib/notifications/send";

// ─── 1. Users & Permissions ──────────────────────────────────────────────────

export interface UpdateUserRoleInput {
  userId: string;
  roles: Array<"admin" | "tutor" | "murid">;
}

export async function executeUpdateUserRole(input: UpdateUserRoleInput, actorId?: string) {
  const userId = input.userId.trim();
  if (!userId) throw new Error("ID Pengguna wajib diisi.");
  if (!input.roles || input.roles.length === 0) {
    throw new Error("Pilih setidaknya satu peran ('admin', 'tutor', atau 'murid').");
  }

  const targetUser = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!targetUser) throw new Error(`Pengguna dengan ID '${userId}' tidak ditemukan.`);

  // Ensure domain identity pengguna exists
  await db
    .insert(pengguna)
    .values({ id: userId, status: "active" })
    .onConflictDoNothing();

  // Clear existing roles and assign new ones
  await db.delete(penggunaPeran).where(eq(penggunaPeran.penggunaId, userId));

  for (const roleCode of input.roles) {
    const roleRecord = await db.query.peran.findFirst({ where: eq(peran.code, roleCode) });
    if (roleRecord) {
      await db.insert(penggunaPeran).values({
        id: membershipIdFor(userId, roleRecord.id),
        penggunaId: userId,
        peranId: roleRecord.id,
        source: "admin-ops-ai",
        auditActorPenggunaId: actorId ?? null,
      });
    }
  }

  // Sync legacy role on user table
  const primaryRole = input.roles.includes("admin")
    ? "admin"
    : input.roles.includes("tutor")
    ? "teacher"
    : "student";

  await db.update(user).set({ role: primaryRole as any }).where(eq(user.id, userId));

  return {
    summary: `Peran pengguna '${targetUser.name}' (${targetUser.email}) berhasil diubah menjadi [${input.roles.join(", ")}].`,
    data: { userId, name: targetUser.name, roles: input.roles },
  };
}

export interface ToggleUserStatusInput {
  userId: string;
  status: "active" | "suspended";
  reason?: string;
}

export async function executeToggleUserStatus(input: ToggleUserStatusInput, actorId?: string) {
  const userId = input.userId.trim();
  if (!userId) throw new Error("ID Pengguna wajib diisi.");

  const targetUser = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!targetUser) throw new Error(`Pengguna dengan ID '${userId}' tidak ditemukan.`);

  await db
    .insert(pengguna)
    .values({ id: userId, status: input.status })
    .onConflictDoUpdate({
      target: pengguna.id,
      set: { status: input.status, updatedAt: new Date() },
    });

  return {
    summary: `Status akun '${targetUser.name}' (${targetUser.email}) berhasil diubah menjadi '${input.status}'.`,
    data: { userId, status: input.status, reason: input.reason },
  };
}

// ─── 2. Broadcast Notifications ──────────────────────────────────────────────

export interface SendBroadcastNotificationInput {
  title: string;
  body: string;
  target?: "all" | "course" | "group";
  targetId?: string;
  link?: string;
}

export async function executeSendBroadcastNotification(input: SendBroadcastNotificationInput, actorId?: string) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) throw new Error("Judul dan isi notifikasi wajib diisi.");

  const target = input.target || "all";
  const link = input.link || "/dashboard";

  const result = await sendAdminBroadcast({
    title,
    body,
    link,
    target,
    targetId: input.targetId,
    actorId: actorId ?? "admin",
  });

  return {
    summary: `Notifikasi broadcast berhasil dikirim ke target '${target}' (${result.succeeded} berhasil, ${result.failedCount} gagal).`,
    data: result,
  };
}

// ─── 3. Tutorial PKA ─────────────────────────────────────────────────────────

export interface ListPkaRegistrationsInput {
  search?: string;
  limit?: number;
}

export async function executeListPkaRegistrations(input: ListPkaRegistrationsInput) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const rows = await db
    .select()
    .from(pkaRegistrations)
    .orderBy(desc(pkaRegistrations.createdAt))
    .limit(limit);

  let filtered = rows;
  if (input.search) {
    const q = input.search.toLowerCase();
    filtered = filtered.filter((r) => r.fullName.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.faculty.toLowerCase().includes(q));
  }

  return {
    summary: `Ditemukan ${filtered.length} pendaftaran program Tutorial PKA.`,
    data: filtered.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      email: r.email,
      faculty: r.faculty,
      instagramUsername: r.instagramUsername,
      proofKey: r.proofKey,
      createdAt: r.createdAt,
    })),
  };
}

export interface CreatePkaAnnouncementInput {
  title: string;
  content: string;
  isPinned?: boolean;
}

export async function executeCreatePkaAnnouncement(input: CreatePkaAnnouncementInput, actorId?: string) {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) throw new Error("Judul dan isi pengumuman PKA wajib diisi.");

  let validCreatorId = actorId || "admin";
  const existingUser = actorId ? await db.query.user.findFirst({ where: eq(user.id, actorId) }) : null;
  if (!existingUser) {
    const anyAdmin = await db.query.user.findFirst();
    if (anyAdmin) validCreatorId = anyAdmin.id;
  }

  const id = `pka-ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(pkaAnnouncements).values({
    id,
    title,
    content,
    isPinned: input.isPinned ?? false,
    createdBy: validCreatorId,
    sentAt: new Date(),
  });

  return {
    summary: `Pengumuman PKA '${title}' berhasil dibuat dan dipublikasikan.`,
    data: { id, title, isPinned: input.isPinned ?? false },
  };
}

export interface CreatePkaScheduleInput {
  title: string;
  sessionAt: string; // ISO date-time or YYYY-MM-DD HH:mm
  meetLink?: string;
}

export async function executeCreatePkaSchedule(input: CreatePkaScheduleInput, actorId?: string) {
  const title = input.title.trim();
  if (!title) throw new Error("Judul sesi PKA wajib diisi.");
  if (!input.sessionAt) throw new Error("Waktu pelaksanaan sesi PKA wajib diisi.");

  const sessionDate = new Date(input.sessionAt);
  if (isNaN(sessionDate.getTime())) throw new Error("Format waktu sesi PKA tidak valid.");

  const id = `pka-sch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(pkaSchedules).values({
    id,
    title,
    sessionAt: sessionDate,
    meetLink: input.meetLink?.trim() || null,
    createdBy: actorId ?? "admin",
    sentAt: new Date(),
  });

  return {
    summary: `Jadwal sesi PKA '${title}' berhasil ditambahkan untuk ${sessionDate.toLocaleString("id-ID")}.`,
    data: { id, title, sessionAt: sessionDate.toISOString(), meetLink: input.meetLink },
  };
}

// ─── 4. Custom Forms & Survey ────────────────────────────────────────────────

export interface ListFormsInput {
  category?: string;
  search?: string;
}

export async function executeListForms(input: ListFormsInput) {
  const forms = await db.query.customForms.findMany({
    with: {
      responses: true,
    },
    orderBy: [desc(customForms.createdAt)],
    limit: 50,
  });

  let list = forms.map((f) => ({
    id: f.id,
    slug: f.slug,
    title: f.title,
    category: f.category,
    responseCount: f.responses?.length ?? 0,
    acceptingResponses: f.settings?.acceptingResponses ?? true,
    createdAt: f.createdAt,
  }));

  if (input.category) {
    list = list.filter((f) => f.category === input.category);
  }
  if (input.search) {
    const q = input.search.toLowerCase();
    list = list.filter((f) => f.title.toLowerCase().includes(q) || f.slug.toLowerCase().includes(q));
  }

  return {
    summary: `Ditemukan ${list.length} formulir kustom.`,
    data: list,
  };
}

export interface CreateOrUpdateFormInput {
  formId?: string;
  slug: string;
  title: string;
  category?: "survey" | "quiz" | "feedback" | "registration";
  description?: string;
  questions?: any[];
}

export async function executeCreateOrUpdateForm(input: CreateOrUpdateFormInput, actorId?: string) {
  const cleanSlug = input.slug.trim().toLowerCase();
  const cleanTitle = input.title.trim();
  if (!cleanSlug) throw new Error("Slug form wajib diisi (misal: 'survey-kepuasan-2026').");
  if (!cleanTitle) throw new Error("Judul formulir wajib diisi.");

  const category = input.category || "survey";
  const defaultQuestions = input.questions || [
    {
      id: randomUUID(),
      type: "short_answer",
      title: "Nama Lengkap",
      required: true,
    },
  ];

  if (input.formId) {
    // Update
    await db
      .update(customForms)
      .set({
        slug: cleanSlug,
        title: cleanTitle,
        category,
        description: input.description?.trim() || null,
        questions: defaultQuestions,
        updatedAt: new Date(),
      })
      .where(eq(customForms.id, input.formId));

    return {
      summary: `Formulir '${cleanTitle}' (/f/${cleanSlug}) berhasil diperbarui.`,
      data: { id: input.formId, slug: cleanSlug, title: cleanTitle },
    };
  }

  // Create new
  const formId = `form-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(customForms).values({
    id: formId,
    slug: cleanSlug,
    title: cleanTitle,
    category,
    description: input.description?.trim() || null,
    questions: defaultQuestions,
    settings: {
      acceptingResponses: true,
      collectEmail: "input",
      limitToOneResponse: false,
    },
    createdById: actorId ?? null,
  });

  return {
    summary: `Formulir '${cleanTitle}' (ID: ${formId}, URL: /f/${cleanSlug}) berhasil dibuat.`,
    data: { id: formId, slug: cleanSlug, title: cleanTitle, category },
  };
}

export interface GetFormResponsesSummaryInput {
  formId: string;
}

export async function executeGetFormResponsesSummary(input: GetFormResponsesSummaryInput) {
  const formId = input.formId.trim();
  if (!formId) throw new Error("ID Form wajib diisi.");

  const form = await db.query.customForms.findFirst({
    where: eq(customForms.id, formId),
    with: { responses: true },
  });
  if (!form) throw new Error(`Formulir '${formId}' tidak ditemukan.`);

  const total = form.responses?.length ?? 0;
  return {
    summary: `Ringkasan Form '${form.title}': ${total} total respon tercatat.`,
    data: {
      id: form.id,
      title: form.title,
      slug: form.slug,
      responseCount: total,
      recentResponses: form.responses?.slice(0, 5).map((r) => ({
        id: r.id,
        submittedAt: r.submittedAt,
        responderEmail: r.responderEmail,
      })),
    },
  };
}

// ─── 5. Blog CMS ─────────────────────────────────────────────────────────────

export interface ListBlogArticlesInput {
  status?: "published" | "draft";
  search?: string;
}

export async function executeListBlogArticles(input: ListBlogArticlesInput) {
  const articles = await db.query.blogArticles.findMany({
    orderBy: [desc(blogArticles.createdAt)],
    limit: 30,
  });

  let list = articles.map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    category: a.category,
    status: a.status,
    readMinutes: a.readMinutes,
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
  }));

  if (input.status) list = list.filter((a) => a.status === input.status);
  if (input.search) {
    const q = input.search.toLowerCase();
    list = list.filter((a) => a.title.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q));
  }

  return {
    summary: `Ditemukan ${list.length} artikel blog.`,
    data: list,
  };
}

export interface CreateBlogArticleInput {
  title: string;
  content: string;
  category?: "tips_kuliah" | "pojok_kampus" | "fakta_seru" | "kegiatan_zyx";
  status?: "draft" | "published";
  summary?: string;
}

export async function executeCreateBlogArticle(input: CreateBlogArticleInput, actorId?: string) {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title) throw new Error("Judul artikel blog wajib diisi.");
  if (!content) throw new Error("Isi artikel blog wajib diisi.");

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `artikel-${Date.now()}`;
  const id = `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const status = input.status || "draft";
  const category = input.category || "tips_kuliah";
  const readMinutes = Math.max(1, Math.ceil(content.split(/\s+/).length / 200));

  await db.insert(blogArticles).values({
    id,
    slug,
    title,
    content,
    summary: input.summary?.trim() || content.slice(0, 150),
    category,
    status,
    readMinutes,
    createdById: actorId ?? null,
    publishedAt: status === "published" ? new Date() : null,
  });

  return {
    summary: `Artikel blog '${title}' (slug: ${slug}) berhasil dibuat dengan status '${status}'.`,
    data: { id, slug, title, status, category },
  };
}

export interface PublishBlogArticleInput {
  articleId: string;
  publish: boolean;
}

export async function executePublishBlogArticle(input: PublishBlogArticleInput) {
  const articleId = input.articleId.trim();
  if (!articleId) throw new Error("ID Artikel wajib diisi.");

  const existing = await db.query.blogArticles.findFirst({ where: eq(blogArticles.id, articleId) });
  if (!existing) throw new Error(`Artikel dengan ID '${articleId}' tidak ditemukan.`);

  const newStatus = input.publish ? "published" : "draft";
  await db
    .update(blogArticles)
    .set({
      status: newStatus,
      publishedAt: input.publish ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(blogArticles.id, articleId));

  return {
    summary: `Artikel '${existing.title}' berhasil diubah statusnya menjadi '${newStatus}'.`,
    data: { id: articleId, status: newStatus },
  };
}

// ─── 6. Ops, Short Links & Feature Flags ─────────────────────────────────────

export async function executeGetFeatureFlags() {
  const flags = getAllFeatureFlagsStatus();
  return {
    summary: `Status Feature Flags sistem (${flags.filter((f) => f.enabled).length} aktif dari total ${flags.length}).`,
    data: flags.map((f) => ({
      key: f.key,
      name: f.name,
      category: f.categoryLabel,
      enabled: f.enabled,
      description: f.description,
    })),
  };
}

export interface SetFeatureFlagInput {
  flagKey: string;
  enabled: boolean;
  reason?: string;
}

export async function executeSetFeatureFlag(input: SetFeatureFlagInput, actorId?: string) {
  const flagKey = input.flagKey.trim();
  if (!flagKey) throw new Error("Kunci feature flag wajib diisi.");

  const known = KNOWN_FEATURE_FLAGS.find((f) => f.key.toLowerCase() === flagKey.toLowerCase());
  if (!known) {
    throw new Error(`Feature flag '${flagKey}' tidak dikenal. Periksa katalog feature flag.`);
  }

  // Set process env
  process.env[known.key] = input.enabled ? "1" : "0";

  return {
    summary: `Feature flag '${known.name}' (${known.key}) berhasil diubah menjadi '${input.enabled ? "AKTIF" : "NONAKTIF"}'.`,
    data: { flagKey: known.key, enabled: input.enabled, reason: input.reason },
  };
}

export interface CreateShortLinkInput {
  slug: string;
  url: string;
  title?: string;
}

export async function executeCreateShortLink(input: CreateShortLinkInput, actorId?: string) {
  const cleanSlug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
  const cleanUrl = input.url.trim();
  if (!cleanSlug) throw new Error("Slug short link wajib diisi (misal: 'tryout-1').");
  if (!cleanUrl) throw new Error("Target URL wajib diisi.");

  let validUserId: string | null = null;
  if (actorId) {
    const existing = await db.query.user.findFirst({ where: eq(user.id, actorId) });
    if (existing) validUserId = existing.id;
  }

  const id = `sl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(shortLink).values({
    id,
    slug: cleanSlug,
    url: cleanUrl,
    title: input.title?.trim() || null,
    userId: validUserId,
  });

  return {
    summary: `Short link '/s/${cleanSlug}' berhasil dibuat mengarah ke '${cleanUrl}'.`,
    data: { id, slug: cleanSlug, url: cleanUrl, shortUrl: `/s/${cleanSlug}` },
  };
}

export interface TriggerAiJobInput {
  jobType: "generate_questions" | "sync_rag" | "extract_ko";
  courseId: string;
}

export async function executeTriggerAiJob(input: TriggerAiJobInput, actorId?: string) {
  const cleanCourseId = input.courseId.trim().toLowerCase();
  if (!cleanCourseId) throw new Error("ID Mata Kuliah wajib diisi.");

  const jobId = randomUUID();
  await db.insert(aiGenerationJobs).values({
    id: jobId,
    courseId: cleanCourseId,
    jobType: input.jobType,
    status: "queued",
  });

  return {
    summary: `Background job AI '${input.jobType}' untuk mata kuliah '${cleanCourseId}' berhasil dimasukkan ke antrean (Job ID: ${jobId}).`,
    data: { jobId, jobType: input.jobType, courseId: cleanCourseId, status: "queued" },
  };
}
