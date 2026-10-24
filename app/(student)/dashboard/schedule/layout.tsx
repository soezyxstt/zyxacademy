import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return { title: pageTitle(t("schedule.pageTitle")), description: t("schedule.metadataDescription") };
}

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
