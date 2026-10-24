import type { Metadata } from "next";
import type { ReactNode } from "react";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  return {
    title: pageTitle(t("metadata.academic.title")),
    description: t("metadata.academic.description"),
  };
}

export default function AcademicLayout({ children }: { children: ReactNode }) {
  return children;
}

