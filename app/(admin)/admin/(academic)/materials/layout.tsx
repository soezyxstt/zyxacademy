import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  return {
    title: pageTitle(t("metadata.materials.title")),
    description: t("metadata.materials.description"),
  };
}

export default function AdminMaterialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
