"use client";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { useTranslations } from "@/lib/i18n/client";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useDemoSession } from "./demo-session";

export function DemoArticleView({ article }: { article: PublicArticleReadModel; nextPath: string }) {
  const { overlay, record, ready, generation } = useDemoSession();
  const experience = useStudentExperience();
  const t = useTranslations("marketing");
  const id = `demo-article-${article.id}`.slice(0, 128);
  const completed = overlay.events.some((event) => event.kind === "article" && event.id === id);
  return <StructuredArticleReader key={generation} article={{ ...article, progress: null }} backHref={experience.route("courses")} adapter={{ completed, ready, completeLabel: t("demo.session.markComplete"), completedLabel: t("demo.session.completed"), onComplete: () => record("article", id) }} />;
}
