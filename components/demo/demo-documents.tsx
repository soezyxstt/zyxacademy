"use client";

import type { DemoProductCollections } from "@/lib/demo/product-pages";
import type { DemoExperience } from "@/app/(marketing)/demo/demo-data";
import type { DemoCatalogue } from "@/lib/demo/catalogue";
import { fictionalMaterialCompleted } from "@/lib/demo/catalogue";
import { CourseDocumentsClient } from "@/app/(student)/courses/[id]/material/course-documents-client";
import { StudentDocumentsView } from "@/components/course/student-documents-view";
import { useStudentExperience } from "@/components/student-experience-provider";
import type { CourseMaterial } from "@/lib/student-course-fixtures";
import { demoSelectionHref } from "@/lib/demo/selection";
import { useDemoSession } from "./demo-session";

export function DemoDocuments({ experience: { content, snapshot }, products, catalogue }: { experience: DemoExperience; products: DemoProductCollections; catalogue: DemoCatalogue }) {
  const { overlay } = useDemoSession();
  const { route } = useStudentExperience();
  const firstChapter = catalogue.chapters[0].id;
  const materials: CourseMaterial[] = [
    ...products.articles.map(item => ({ ...item, courseId: snapshot.courseId, kind: "article" as const, source: "canonical-article", docCategory: "materi" as const, chapterId: firstChapter,
      completed: overlay.events.some(event => event.kind === "article" && event.id === `demo-article-${item.id}`.slice(0,128)),
      href: demoSelectionHref(route("article"), {}, { articleId: item.id, collectionOffset: item.collectionOffset }),
    })),
    ...products.diktats.map(item => ({ ...item, courseId: snapshot.courseId, kind: "pdf" as const, source: "canonical-diktat", docCategory: "diktat" as const, chapterId: firstChapter, completed: overlay.events.some(event => event.kind === "article" && event.id === `demo-diktat-${item.id}`.slice(0,128)),
      href: demoSelectionHref(route("diktat"), {}, { diktatId: item.id, collectionOffset: item.collectionOffset }),
    })),
  ];
  const visibleIds = new Set(materials.map(item => item.id));
  for (const item of catalogue.materials) {
    if (visibleIds.has(item.id)) continue;
    const chapterIndex = catalogue.chapters.findIndex(chapter => chapter.id === item.chapterId);
    materials.push({ id: item.id, courseId: snapshot.courseId, title: item.title,
      kind: item.kind === "diktat" || item.kind === "pdf" ? "pdf" : "article", docCategory: item.kind === "diktat" ? "diktat" : item.category ?? "materi",
      chapterId: item.chapterId, chapterIds: item.chapterIds, subcategory: item.subcategory, year: item.year, locked: true, href: route("documents"),
      completed: chapterIndex >= 0 && fictionalMaterialCompleted(snapshot.courseId, item, chapterIndex),
    });
  }
  return <StudentDocumentsView courseTitle={content.course.title}>
    <CourseDocumentsClient courseId={snapshot.courseId} courseTitle={content.course.title} materials={materials}
      chapters={catalogue.chapters}
      accessTier="standard" forcePageNavigation
    />
  </StudentDocumentsView>;
}
