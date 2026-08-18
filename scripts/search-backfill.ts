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
} from "@/db/schema";
import { STATIC_PAGES, LANDING_SUBJECTS } from "@/lib/site-search-index";

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
        isSynced: doc.isSynced ?? false,
        updatedAt: new Date(),
      },
    });
}

function determineNavMinRole(href: string): number {
  if (href.startsWith("/admin")) {
    return 3;
  }
  if (
    href === "/dashboard" ||
    href.startsWith("/calendar") ||
    href.startsWith("/settings") ||
    href.startsWith("/profile") ||
    href.startsWith("/feedback")
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
    const kindLabel = cm.type === "contoh_soal" ? "contoh soal latihan" : "materi kelas bahan ajar";
    const doc: SearchDocInsert = {
      id: `material_${cm.id}`,
      entityType: "material",
      entityId: cm.id,
      courseId: cm.courseId,
      title: cm.title,
      searchableText: [cm.title, kindLabel].filter(Boolean).join(" ").trim(),
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

  const total = Object.values(stats).reduce((acc, n) => acc + n, 0);
  console.log(`Search backfill completed successfully. Total indexed documents: ${total}`);
  return { total, stats };
}

if (import.meta.main || process.argv[1]?.includes("search-backfill")) {
  runSearchBackfill()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("Search backfill failed:", err);
      process.exit(1);
    });
}
