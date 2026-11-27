import type { Metadata } from "next";
import { PublicFormViewer } from "@/components/forms/public-form-viewer";
import { redirect } from "next/navigation";
import { cache } from "react";
import { findShortFormEntry } from "@/lib/forms/short-entry";
import { createMetadata } from "@/lib/site";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";

const loadEntry = cache(findShortFormEntry);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getAppLocale();
  const t = await getTranslations("marketing");
  const entry = await loadEntry(slug);

  if (entry?.kind === "form") {
    const { form } = entry;
    return createMetadata({
      title: form.title,
      description: form.description || t("publicForm.formFor", { title: form.title }),
      path: `/f/${slug}`,
      locale,
    });
  }

  if (entry?.kind === "meeting") {
    return createMetadata({
      title: t("public.meetFor", { title: entry.title }),
      description: t("public.meetForDescription", { title: entry.title }),
      path: `/f/${slug}`,
      locale,
    });
  }

  return createMetadata({
    title: t("publicForm.formTitle"),
    description: t("publicForm.formDescription"),
    path: `/f/${slug}`,
      locale,
  });
}

export default async function ShortFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = await loadEntry(slug);
  if (entry?.kind === "meeting") redirect(entry.meetingUri);

  return <PublicFormViewer idOrSlug={slug} shortEntry />;
}
