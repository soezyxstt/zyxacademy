import type { Metadata } from "next";
import { DocsIndexView } from "@/components/docs/docs-index-view";
import { getTranslations } from "@/lib/i18n/server";
import { pageTitle } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tutor.docs");
  return { title: pageTitle(t("title")) };
}

export default function TutorDocsPage() {
  return <DocsIndexView surface="tutor" />;
}
