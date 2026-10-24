import type { Metadata } from "next";
import { PublicFormViewer } from "@/components/forms/public-form-viewer";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customForms, googleMeetSessions } from "@/db/schema";
import { createMetadata } from "@/lib/site";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getAppLocale();
  const t = await getTranslations("marketing");
  const normalizedSlug = slug.toLowerCase();

  const [form] = await db
    .select({
      title: customForms.title,
      description: customForms.description,
    })
    .from(customForms)
    .where(and(eq(customForms.slug, normalizedSlug), isNull(customForms.deletedAt)))
    .limit(1);

  if (form) {
    return createMetadata({
      title: form.title,
      description: form.description || t("publicForm.formFor", { title: form.title }),
      path: `/f/${slug}`,
      locale,
    });
  }

  const [meet] = await db
    .select({ title: googleMeetSessions.title })
    .from(googleMeetSessions)
    .where(
      and(
        eq(googleMeetSessions.slug, normalizedSlug),
        isNull(googleMeetSessions.deletedAt)
      )
    )
    .limit(1);

  if (meet) {
    return createMetadata({
      title: t("public.meetFor", { title: meet.title }),
      description: t("public.meetForDescription", { title: meet.title }),
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
  const normalizedSlug = slug.toLowerCase();
  const [formRows, meetRows] = await Promise.all([
    db
      .select({ id: customForms.id })
      .from(customForms)
      .where(and(eq(customForms.slug, normalizedSlug), isNull(customForms.deletedAt)))
      .limit(1),
    db
      .select({ meetingUri: googleMeetSessions.meetingUri })
      .from(googleMeetSessions)
      .where(
        and(
          eq(googleMeetSessions.slug, normalizedSlug),
          isNull(googleMeetSessions.deletedAt)
        )
      )
      .limit(1),
  ]);

  if (formRows.length === 0 && meetRows[0]?.meetingUri) {
    redirect(meetRows[0].meetingUri);
  }

  return <PublicFormViewer idOrSlug={slug} />;
}
