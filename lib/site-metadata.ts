import "server-only";
import type { Metadata } from "next";
import { createMetadata } from "@/lib/site";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";

export async function createLocalizedMetadata({
  path,
  titleKey,
  descriptionKey,
  noIndex = false,
  type = "website",
}: {
  path: string;
  titleKey: string;
  descriptionKey: string;
  noIndex?: boolean;
  type?: "website" | "article";
}): Promise<Metadata> {
  const locale = await getAppLocale();
  const t = await getTranslations("marketing");
  return createMetadata({
    title: t(titleKey),
    description: t(descriptionKey),
    path,
    locale,
    translated: true,
    noIndex,
    type,
  });
}
