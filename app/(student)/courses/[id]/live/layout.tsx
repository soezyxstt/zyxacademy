import type { Metadata } from "next";
import { getCourse } from "@/lib/course-utils";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [course, t] = await Promise.all([getCourse(id), getTranslations("studentExtras.live")]);
  const courseTitle = course?.title;
  return {
    title: pageTitle(courseTitle ? t("courseLiveTitle", { course: courseTitle }) : t("title")),
    description: courseTitle
      ? t("metadataDescription", { course: courseTitle })
      : t("metadataDescriptionFallback"),
  };
}

export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
