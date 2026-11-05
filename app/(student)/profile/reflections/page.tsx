import { StudentReflectionsView } from "@/components/student-reflections-view";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { weeklyReflections } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return { title: pageTitle(t("reflections.title")), description: t("reflections.metadataDescription") };
}

export default async function ReflectionsArchivePage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });

  if (!session?.user) {
    redirect("/sign-in?next=/profile/reflections");
  }

  const reflections = await db
    .select()
    .from(weeklyReflections)
    .where(eq(weeklyReflections.studentId, session.user.id))
    .orderBy(desc(weeklyReflections.weekStart));

  return <StudentReflectionsView reflections={reflections} />;
}
