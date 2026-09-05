import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  searchDocuments,
  courses,
  chapters,
  aiMaterialInstances,
  diktats,
  courseMaterials,
  exams,
  quizTemplates,
  blogArticles,
  customForms,
  groups,
  googleMeetSessions,
  bookings,
  user as userTable,
  enrollmentTokens,
  academicSchedules,
} from "@/db/schema";
import { STATIC_PAGES, LANDING_SUBJECTS } from "@/lib/site-search-index";
import { inngest } from "@/lib/inngest";

type SearchDocInsert = typeof searchDocuments.$inferInsert;

async function upsertSearchDocument(doc: SearchDocInsert): Promise<void> {
  await db
    .insert(searchDocuments)
    .values(doc)
    .onConflictDoUpdate({
      target: searchDocuments.id,
      set: {
        entityType: doc.entityType,
        entityId: doc.entityId,
        courseId: doc.courseId,
        title: doc.title,
        searchableText: doc.searchableText,
        path: doc.path,
        minRole: doc.minRole,
        updatedAt: new Date(),
      },
    });
}

function determineNavMinRole(href: string): number {
  if (href.startsWith("/admin")) {
    return 3;
  }
  if (href.startsWith("/tutor")) {
    return 2;
  }
  if (
    href.startsWith("/dashboard") ||
    href.startsWith("/calendar") ||
    href.startsWith("/settings") ||
    href.startsWith("/profile") ||
    href.startsWith("/leaderboard") ||
    href.startsWith("/feedback") ||
    href.includes("tutorial-pka")
  ) {
    return 1;
  }
  return 0;
}

export async function runSearchBackfill(): Promise<{
  total: number;
  stats: Record<string, number>;
}> {
  console.log("Starting search documents backfill...");
  const stats: Record<string, number> = {
    nav: 0,
    course: 0,
    chapter: 0,
    material: 0,
    quiz: 0,
    exam: 0,
    blog: 0,
    form: 0,
    group: 0,
    meet: 0,
    user: 0,
    token: 0,
    schedule: 0,
  };

  // 1. Static navigation pages and landing subjects
  for (const page of STATIC_PAGES) {
    const slugKey = page.href.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+|_+$/g, "") || "root";
    const doc: SearchDocInsert = {
      id: `nav_${slugKey}`,
      entityType: "nav",
      entityId: page.href,
      courseId: null,
      title: page.title,
      searchableText: [page.title, page.subtitle, page.keywords, page.content]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: page.href,
      minRole: determineNavMinRole(page.href),
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.nav++;
  }

  for (const subject of LANDING_SUBJECTS) {
    const slugKey = subject.title.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+|_+$/g, "");
    const doc: SearchDocInsert = {
      id: `nav_landing_${slugKey}`,
      entityType: "nav",
      entityId: subject.href,
      courseId: null,
      title: subject.title,
      searchableText: [subject.title, subject.subtitle, subject.keywords, subject.content]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: subject.href,
      minRole: 0,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.nav++;
  }
  console.log(`Indexed ${stats.nav} navigation and landing entries.`);

  // 2. Courses
  const allCourses = await db.select().from(courses);
  for (const course of allCourses) {
    const doc: SearchDocInsert = {
      id: `course_${course.id}`,
      entityType: "course",
      entityId: course.id,
      courseId: course.id,
      title: course.title,
      searchableText: [course.title, course.category, course.description]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: `/courses/${course.id}`,
      minRole: 0,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.course++;
  }
  console.log(`Indexed ${stats.course} courses.`);

  // 3. Chapters
  const allChapters = await db.select().from(chapters);
  for (const chapter of allChapters) {
    const doc: SearchDocInsert = {
      id: `chapter_${chapter.id}`,
      entityType: "chapter",
      entityId: chapter.id,
      courseId: chapter.courseId,
      title: chapter.title,
      searchableText: [chapter.title, chapter.description]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: `/courses/${chapter.courseId}`,
      minRole: 1,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.chapter++;
  }
  console.log(`Indexed ${stats.chapter} chapters.`);

  // 4. AI Material Instances
  const allAiMaterials = await db.select().from(aiMaterialInstances);
  for (const instance of allAiMaterials) {
    const learningObj = Array.isArray(instance.learningObjectives)
      ? instance.learningObjectives.join(" ")
      : "";
    const kw = Array.isArray(instance.keywords)
      ? instance.keywords.join(" ")
      : "";
    const doc: SearchDocInsert = {
      id: `material_${instance.id}`,
      entityType: "material",
      entityId: instance.id,
      courseId: instance.courseId,
      title: instance.title,
      searchableText: [instance.title, instance.summary, learningObj, kw]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: `/courses/${instance.courseId}/material/${instance.id}`,
      minRole: 1,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.material++;
  }

  // 5. Course Materials
  const allCourseMaterials = await db.select().from(courseMaterials);
  for (const cm of allCourseMaterials) {
    const kindLabel = cm.type === "contoh_soal" || cm.type === "soal" ? "soal latihan" : cm.type === "pembahasan_soal" ? "pembahasan soal solusi" : "materi kelas bahan ajar";
    const subLabel = cm.subcategory ? cm.subcategory : "";
    const yearLabel = cm.year ? String(cm.year) : "";
    const doc: SearchDocInsert = {
      id: `material_${cm.id}`,
      entityType: "material",
      entityId: cm.id,
      courseId: cm.courseId,
      title: cm.title,
      searchableText: [cm.title, kindLabel, subLabel, yearLabel].filter(Boolean).join(" ").trim(),
      path: `/courses/${cm.courseId}/material/${cm.id}`,
      minRole: 1,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.material++;
  }

  // 6. Diktats
  const allDiktats = await db.select().from(diktats);
  for (const diktat of allDiktats) {
    const doc: SearchDocInsert = {
      id: `material_diktat_${diktat.id}`,
      entityType: "material",
      entityId: diktat.id,
      courseId: diktat.courseId,
      title: diktat.title,
      searchableText: [diktat.title, "diktat buku materi kompilasi pdf"].filter(Boolean).join(" ").trim(),
      path: `/courses/${diktat.courseId}/material`,
      minRole: 1,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.material++;
  }
  console.log(`Indexed ${stats.material} total materials (AI materials, course materials, diktats).`);

  // 7. Exams
  const allExams = await db.select().from(exams);
  for (const exam of allExams) {
    const isQuiz = exam.type === "quiz";
    const typeLabel = isQuiz ? "kuis quiz evaluasi latihan" : "tryout ujian evaluasi";
    const doc: SearchDocInsert = {
      id: `${isQuiz ? "quiz" : "exam"}_${exam.id}`,
      entityType: isQuiz ? "quiz" : "exam",
      entityId: exam.id,
      courseId: exam.courseId,
      title: exam.title,
      searchableText: [exam.title, typeLabel].filter(Boolean).join(" ").trim(),
      path: `/courses/${exam.courseId}/${isQuiz ? "quiz" : "tryout"}/${exam.id}`,
      minRole: 1,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    if (isQuiz) {
      stats.quiz++;
    } else {
      stats.exam++;
    }
  }

  // 8. Quiz Templates
  const allQuizTemplates = await db.select().from(quizTemplates);
  for (const template of allQuizTemplates) {
    const doc: SearchDocInsert = {
      id: `quiz_${template.id}`,
      entityType: "quiz",
      entityId: template.id,
      courseId: template.courseId,
      title: template.title,
      searchableText: [template.title, "kuis quiz", template.category, template.visibility]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: `/courses/${template.courseId}/quiz/${template.id}`,
      minRole: template.visibility === "free" ? 0 : 1,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.quiz++;
  }
  console.log(`Indexed ${stats.quiz} quizzes and ${stats.exam} exams.`);

  // 9. Blog Articles
  const allBlogArticles = await db.select().from(blogArticles);
  for (const article of allBlogArticles) {
    const tags = Array.isArray(article.tags) ? article.tags.join(" ") : "";
    const doc: SearchDocInsert = {
      id: `blog_${article.id}`,
      entityType: "blog",
      entityId: article.id,
      courseId: null,
      title: article.title,
      searchableText: [article.title, article.summary, article.category, tags, article.content]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: `/blog/${article.slug}`,
      minRole: article.status === "published" ? 0 : 3,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.blog++;
  }
  console.log(`Indexed ${stats.blog} blog articles.`);

  // 10. Custom Forms (only non-deleted)
  const allCustomForms = await db
    .select()
    .from(customForms)
    .where(isNull(customForms.deletedAt));

  for (const form of allCustomForms) {
    const doc: SearchDocInsert = {
      id: `form_${form.id}`,
      entityType: "form",
      entityId: form.id,
      courseId: null,
      title: form.title,
      searchableText: [form.title, form.description, form.category]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: `/f/${form.slug}`,
      minRole: 0,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.form++;
  }
  console.log(`Indexed ${stats.form} custom forms.`);

  // 11. Study Groups (Kelompok Belajar)
  const allGroups = await db.select().from(groups);
  for (const g of allGroups) {
    const doc: SearchDocInsert = {
      id: `group_${g.id}`,
      entityType: "group",
      entityId: g.id,
      courseId: null,
      title: g.name,
      searchableText: [
        g.name,
        g.packageName,
        g.packageType,
        g.academicYear,
        g.semester,
        g.notes,
        "kelompok belajar grup study group",
      ]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: `/admin/groups`,
      minRole: 1,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.group++;
  }
  console.log(`Indexed ${stats.group} study groups.`);

  // 12. Google Meet Sessions & Sesi Pertemuan
  const allMeetSessions = await db.select().from(googleMeetSessions);
  for (const m of allMeetSessions) {
    const doc: SearchDocInsert = {
      id: `meet_${m.id}`,
      entityType: "meet",
      entityId: m.id,
      courseId: null,
      title: m.title,
      searchableText: [
        m.title,
        m.meetingCode,
        m.spaceName,
        "google meet ruang virtual pertemuan sesi",
      ]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: `/meet/${m.slug || m.id}`,
      minRole: 1,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.meet++;
  }

  const allBookings = await db.select().from(bookings);
  for (const b of allBookings) {
    if (b.topic || b.googleMeetUrl) {
      const doc: SearchDocInsert = {
        id: `meet_booking_${b.id}`,
        entityType: "meet",
        entityId: b.id,
        courseId: null,
        title: b.topic || "Sesi Pertemuan Tutor",
        searchableText: [
          b.topic,
          b.sessionDate,
          b.startTime,
          b.location,
          "booking sesi tutorial tutor meet",
        ]
          .filter(Boolean)
          .join(" ")
          .trim(),
        path: `/dashboard/schedule`,
        minRole: 1,
        isSynced: false,
      };
      await upsertSearchDocument(doc);
      stats.meet++;
    }
  }
  console.log(`Indexed ${stats.meet} meet sessions and bookings.`);

  // 13. Users (Akun Pengguna - Admin Only)
  const allUsers = await db.select().from(userTable);
  for (const u of allUsers) {
    const doc: SearchDocInsert = {
      id: `user_${u.id}`,
      entityType: "user",
      entityId: u.id,
      courseId: null,
      title: `${u.name} (${u.email})`,
      searchableText: [u.name, u.email, u.role, "pengguna user akun murid tutor admin"]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: `/admin`,
      minRole: 3,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.user++;
  }
  console.log(`Indexed ${stats.user} user accounts.`);

  // 14. Enrollment Tokens (Voucher & Token - Admin Only)
  const allTokens = await db.select().from(enrollmentTokens);
  for (const t of allTokens) {
    const doc: SearchDocInsert = {
      id: `token_${t.id}`,
      entityType: "token",
      entityId: t.id,
      courseId: null,
      title: `Token: ${t.token} (${t.capacity} siswa)`,
      searchableText: [
        t.token,
        `kapasitas ${t.capacity}`,
        "token voucher aktivasi pendaftaran kelas",
      ]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: `/admin/tokens`,
      minRole: 3,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.token++;
  }
  console.log(`Indexed ${stats.token} enrollment tokens.`);

  // 15. Academic Schedules (Jadwal Akademik & Ujian)
  const allSchedules = await db.select().from(academicSchedules);
  for (const s of allSchedules) {
    const doc: SearchDocInsert = {
      id: `schedule_${s.id}`,
      entityType: "schedule",
      entityId: s.id,
      courseId: s.courseId,
      title: s.title,
      searchableText: [
        s.title,
        s.type,
        s.description,
        s.location,
        "jadwal akademik kalender ujian uts uas agenda",
      ]
        .filter(Boolean)
        .join(" ")
        .trim(),
      path: `/dashboard/schedule`,
      minRole: 1,
      isSynced: false,
    };
    await upsertSearchDocument(doc);
    stats.schedule++;
  }
  console.log(`Indexed ${stats.schedule} academic schedules.`);

  const total = Object.values(stats).reduce((acc, n) => acc + n, 0);
  console.log(`Search backfill completed successfully. Total indexed documents: ${total}`);

  try {
    await inngest.send({ name: "search.documents.sync" });
  } catch (err) {
    console.warn("Failed to trigger search.documents.sync via Inngest:", err);
  }

  return { total, stats };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedWithRetry(
  title: string,
  text: string,
  embedFn: (title: string, content: string) => Promise<number[]>,
  maxRetries = 5,
): Promise<number[]> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await embedFn(title, text);
    } catch (err: unknown) {
      attempt++;
      const errMsg = String((err as Error)?.message || err);
      const isRateLimit =
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("rate") ||
        errMsg.toLowerCase().includes("quota") ||
        errMsg.toLowerCase().includes("exhausted");

      if (isRateLimit && attempt < maxRetries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 15000);
        console.warn(`    [Rate Limit] Retrying "${title}" in ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt}/${maxRetries})...`);
        await sleep(delayMs);
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Failed to embed "${title}" after ${maxRetries} attempts`);
}

export async function syncSearchVectorsDirect(): Promise<{ synced: number; failed: number }> {
  const { embedSearchDocument, upsertSearchVectors, querySearchVectors } = await import("@/lib/search/service");
  const { inArray, eq } = await import("drizzle-orm");

  const pending = await db
    .select()
    .from(searchDocuments)
    .where(eq(searchDocuments.isSynced, false));

  console.log(`\n==================================================================`);
  console.log(`  Direct Vectorize Sync: ${pending.length} unsynced search documents`);
  console.log(`==================================================================`);

  if (pending.length === 0) {
    console.log("All search documents are already synchronized to Vectorize.");
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;
  const BATCH_SIZE = 20;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const chunk = pending.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(pending.length / BATCH_SIZE);
    console.log(`[Batch ${batchNum}/${totalBatches}] Embedding & uploading ${chunk.length} documents...`);

    const vectors = [];
    const successIds: string[] = [];

    for (const doc of chunk) {
      try {
        const textContent = doc.searchableText?.trim() || doc.title;
        const values = await embedWithRetry(doc.title, textContent, embedSearchDocument);

        // Pacing delay between Gemini embedding calls to stay well clear of rate limits
        await sleep(350);

        let category = "Navigasi";
        if (doc.entityType === "course") {
          category = "Course & Modul";
        } else if (
          doc.entityType === "chapter" ||
          doc.entityType === "material" ||
          doc.entityType === "blog"
        ) {
          category = "Materi & Artikel";
        } else if (doc.entityType === "quiz" || doc.entityType === "exam") {
          category = "Kuis & Evaluasi";
        }

        vectors.push({
          id: doc.id,
          values,
          metadata: {
            title: doc.title,
            href: doc.path,
            category,
            entity_type: doc.entityType,
            entity_id: doc.entityId ?? "",
            course_id: doc.courseId ?? "",
            min_role: doc.minRole ?? 0,
          },
        });
        successIds.push(doc.id);
      } catch (err) {
        console.error(`  - Failed to embed document ${doc.id} (${doc.title}):`, err);
        failed++;
      }
    }

    if (vectors.length > 0) {
      try {
        await upsertSearchVectors(vectors);
        await db
          .update(searchDocuments)
          .set({
            isSynced: true,
            syncStatus: "completed",
            updatedAt: new Date(),
          })
          .where(inArray(searchDocuments.id, successIds));
        synced += vectors.length;
        console.log(`  -> Successfully upserted ${vectors.length} vectors to Cloudflare Vectorize.`);
      } catch (err) {
        console.error(`  - Failed to upsert vector batch to Vectorize:`, err);
        failed += vectors.length;
      }
    }
  }

  console.log(`\nVectorize sync complete: ${synced} synced, ${failed} failed.`);

  // Sample query test to verify retrieval
  try {
    console.log("\nRunning sample semantic search verification query...");
    const sampleVec = await embedSearchDocument("Kalkulus", "Kalkulus diferensial integral");
    const testRes = await querySearchVectors({ vector: sampleVec, topK: 3 });
    console.log(`Verification query for 'Kalkulus' returned ${testRes.matches.length} matches:`);
    for (const match of testRes.matches) {
      console.log(`  - [Score: ${match.score?.toFixed(4)}] ${match.metadata.title} (${match.metadata.category} -> ${match.metadata.href})`);
    }
  } catch (err) {
    console.warn("Verification query test warning:", err);
  }

  return { synced, failed };
}

if (import.meta.main || process.argv[1]?.includes("search-backfill")) {
  const shouldSyncVectors = process.argv.includes("--sync-vectors") || process.argv.includes("--direct");
  const vectorsOnly = process.argv.includes("--vectors-only") || process.argv.includes("--only-vectors");

  const run = async () => {
    if (!vectorsOnly) {
      await runSearchBackfill();
    }
    if (shouldSyncVectors || vectorsOnly) {
      await syncSearchVectorsDirect();
    }
    process.exit(0);
  };

  run().catch((err) => {
    console.error("Search backfill failed:", err);
    process.exit(1);
  });
}
