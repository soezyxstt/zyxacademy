import type { Metadata } from "next";

import { PublicLinksDirectory } from "./directory";
import { listPublicLinks } from "@/lib/public-links";
import { createMetadata } from "@/lib/site";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing");
  const locale = await getAppLocale();
  return createMetadata({ title: t("tautan.title"), description: t("tautan.description"), path: "/tautan", locale });
}

export const dynamic = "force-dynamic";

export default async function TautanPage() {
  const [t, links] = await Promise.all([getTranslations("marketing"), listPublicLinks()]);
  return <PublicLinksDirectory links={links} copy={{
    title: t("tautan.title"), description: t("tautan.description"),
    emptyTitle: t("tautan.emptyTitle"), emptyDescription: t("tautan.emptyDescription"),
  }} />;
}
