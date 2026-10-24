import type { ReactNode } from "react";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("contentSection.title")), description: t("contentSection.description") };
}

export default function ContentLayout({ children }: { children: ReactNode }) {
  return children;
}

