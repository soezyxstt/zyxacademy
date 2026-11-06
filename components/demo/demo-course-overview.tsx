"use client";

import type { DemoExperience } from "@/app/(marketing)/demo/demo-data";
import type { DemoCatalogue } from "@/lib/demo/catalogue";
import { StudentCourseOverviewView } from "@/components/course/student-course-overview-view";
import { CoursePrimaryActions } from "@/components/course/course-primary-actions";
import { CourseAttentionStrip } from "@/components/course/course-attention-strip";
import { ChapterOutlineList } from "@/components/course/chapter-outline-list";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useTranslations } from "@/lib/i18n/client";
import { demoChapterOutline } from "@/lib/demo/chapter-outline";
import { demoProgress } from "@/lib/demo/progress-overlay";
import { useDemoSession } from "./demo-session";

export function DemoCourseOverview({ experience: { content, snapshot }, catalogue }: { experience: DemoExperience; catalogue: DemoCatalogue }) {
  const { overlay } = useDemoSession();
  const { href, route } = useStudentExperience();
  const t = useTranslations("studentCourse");
  const progress = demoProgress(snapshot, overlay);
  const base = `/courses/${snapshot.courseId}`;
  const destination = (path: string) => href?.(path) ?? path;
  const chapters = demoChapterOutline({ courseId: snapshot.courseId, catalogue, articleId: content.article.id,
    overlay, articleHref: route("article"), partialPercent: snapshot.inProgressDocuments[0]?.completionPercent ?? 0,
    progressLabel: percent => t("course.chapterOutline.percentRead", { percent }),
  });
  return <StudentCourseOverviewView href={href} course={content.course} isEnrolled
    highlights={<>
      <CoursePrimaryActions className="mb-6"
        reading={{ tag: "DOKUMEN", title: content.article.title, meta: `${snapshot.inProgressDocuments[0]?.completionPercent ?? 0}% selesai`, actionLabel: "", href: destination(`${base}/material`) }}
        quiz={{ tag: "KUIS", title: snapshot.availableAssessments[0]?.title ?? "", meta: `${snapshot.availableAssessments.filter(item => item.type === "quiz").length} kuis tersedia`, actionLabel: "", href: destination(`${base}/quiz`) }}
        schedule={{ tag: "JADWAL", title: t("course.actions.tutorial"), meta: "Lihat jadwal dan slot yang tersedia", actionLabel: t("course.actions.tutorial"), href: destination(`/dashboard/schedule?course=${snapshot.courseId}`) }}
      />
      <CourseAttentionStrip className="mb-6" attention={{ items: [{ kind: "flashcard", label: `${progress.dueCount} flashcard perlu diulas`, actionLabel: "Ulas sekarang", href: route("flashcards") }] }} />
    </>}
    chapterOutline={<ChapterOutlineList chapters={chapters} />}
  />;
}
