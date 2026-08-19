import { PublicFormViewer } from "@/components/forms/public-form-viewer";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customForms, googleMeetSessions } from "@/db/schema";

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
