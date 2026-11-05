"use client";

import type { DemoProductCollections } from "@/lib/demo/product-pages";
import type { DemoExperience } from "@/app/(marketing)/demo/demo-data";
import { CourseDocumentsClient } from "@/app/(student)/courses/[id]/material/course-documents-client";
import { StudentDocumentsView } from "@/components/course/student-documents-view";
import { useStudentExperience } from "@/components/student-experience-provider";
import type { CourseMaterial } from "@/lib/student-course-fixtures";
import { demoSelectionHref } from "@/lib/demo/selection";
import { useDemoSession } from "./demo-session";

export function DemoDocuments({ experience: { content, snapshot }, products }: { experience: DemoExperience; products: DemoProductCollections }) {
  const { overlay } = useDemoSession();
  const { route } = useStudentExperience();
  const firstChapter = "fictional-first-chapter";
  const materials: CourseMaterial[] = [
    ...products.articles.map(item => ({ ...item, courseId: snapshot.courseId, kind: "article" as const, source: "canonical-article", docCategory: "materi" as const, chapterId: firstChapter,
      completed: overlay.events.some(event => event.kind === "article" && event.id === `demo-article-${item.id}`.slice(0,128)),
      href: demoSelectionHref(route("article"), {}, { articleId: item.id, collectionOffset: item.collectionOffset }),
    })),
    ...products.diktats.map(item => ({ ...item, courseId: snapshot.courseId, kind: "pdf" as const, source: "canonical-diktat", docCategory: "diktat" as const, chapterId: firstChapter, completed: overlay.events.some(event => event.kind === "article" && event.id === `demo-diktat-${item.id}`.slice(0,128)),
      href: demoSelectionHref(route("diktat"), {}, { diktatId: item.id, collectionOffset: item.collectionOffset }),
    })),
  ];
  return <StudentDocumentsView courseTitle={content.course.title}>
    <CourseDocumentsClient courseId={snapshot.courseId} courseTitle={content.course.title} materials={materials}
      chapters={[{ id: firstChapter, title: content.course.chapterTitle, orderIndex: 1 }, ...(snapshot.mockChapters ?? []).map(chapter => ({ id: chapter.id, title: chapter.title, orderIndex: chapter.orderIndex }))]}
      accessTier="standard" forcePageNavigation
    />
  </StudentDocumentsView>;
}
