import type { Metadata } from "next";
import { PublicFormViewer } from "@/components/forms/public-form-viewer";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customForms, googleMeetSessions } from "@/db/schema";
import { createMetadata } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
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
      description: form.description || `Formulir ${form.title} di Zyx Academy.`,
      path: `/f/${slug}`,
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
      title: `Google Meet: ${meet.title}`,
      description: `Ruang pertemuan Google Meet untuk ${meet.title}.`,
      path: `/f/${slug}`,
    });
  }

  return createMetadata({
    title: "Formulir",
    description: "Formulir Zyx Academy.",
    path: `/f/${slug}`,
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
