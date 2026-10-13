import type { Metadata } from "next";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { customForms } from "@/db/schema";
import { createMetadata } from "@/lib/site";
import { PublicFormViewer } from "@/components/forms/public-form-viewer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
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
    });
  }

  return createMetadata({
    title: "Formulir",
    description: "Formulir Zyx Academy.",
    path: `/forms/${id}`,
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

