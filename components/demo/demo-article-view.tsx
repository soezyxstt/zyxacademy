"use client";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useDemoSession } from "./demo-session";

export function DemoArticleView({ article, course }: { article: PublicArticleReadModel; course: { id: string; title: string } }) {
  const { overlay, record, ready, generation } = useDemoSession();
  const experience = useStudentExperience();
  const id = `demo-article-${article.id}`.slice(0, 128);
  const completed = overlay.events.some((event) => event.kind === "article" && event.id === id);
  return <StructuredArticleReader key={generation} article={{ ...article, progress: null }} course={course} backHref={experience.href?.(`/courses/${course.id}/material`)} adapter={{ completed, ready, onComplete: () => record("article", id) }} />;
}
