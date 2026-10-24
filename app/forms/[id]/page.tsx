import type { Metadata } from "next";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { customForms } from "@/db/schema";
import { createMetadata } from "@/lib/site";
import { PublicFormViewer } from "@/components/forms/public-form-viewer";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const locale = await getAppLocale();
  const t = await getTranslations("marketing");
  const normalized = id.toLowerCase();

  const [form] = await db
    .select({
      title: customForms.title,
      description: customForms.description,
    })
    .from(customForms)
    .where(
      and(
        isNull(customForms.deletedAt),
        or(eq(customForms.id, id), eq(customForms.slug, normalized))
      )
    )
    .limit(1);

  if (form) {
    return createMetadata({
      title: form.title,
      description: form.description || `Formulir ${form.title} di Zyx Academy.`,
      path: `/forms/${id}`,
      locale,
    });
  }

  return createMetadata({
      title: t("publicForm.formTitle"),
      description: t("publicForm.formDescription"),
    path: `/forms/${id}`,
      locale,
  });
}

export default async function FullFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicFormViewer idOrSlug={id} />;
}

