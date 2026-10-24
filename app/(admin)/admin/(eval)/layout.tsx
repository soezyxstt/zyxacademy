import type { Metadata } from "next";
import type { ReactNode } from "react";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminEval");
  return {
    title: pageTitle(t("metadata.title")),
    description: t("metadata.description"),
  };
}

export default function EvalLayout({ children }: { children: ReactNode }) {
  return children;
}

