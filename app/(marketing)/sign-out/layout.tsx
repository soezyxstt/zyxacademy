import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing");
  return {
    title: pageTitle(t("signOut.title")),
    description: t("signOut.description"),
  };
}

export default function SignOutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
