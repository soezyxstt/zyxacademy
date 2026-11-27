import type { Metadata } from "next";
import { StudentCourseCatalogView } from "@/components/course/student-course-catalog-view";
import { createMetadata } from "@/lib/site";
import { getAuthSession } from "@/lib/auth-session";
import { getWhatsAppAdminChatHref } from "@/lib/whatsapp-admin";
import { getTranslations } from "@/lib/i18n/server";
import { loadStudentCourseCatalog } from "@/lib/student/course-catalog-view-data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("learning");
  return createMetadata({ title: t("metadata.catalogTitle"), description: t("metadata.catalogDescription"), path: "/courses" });
}

export default async function CoursesPage() {
  const session = await getAuthSession();
  const user = session?.user as unknown as Record<string, unknown> | undefined;
  const data = await loadStudentCourseCatalog(session?.user?.id, {
    major: typeof user?.major === "string" ? user.major : null,
    entryYear: typeof user?.entryYear === "number" ? user.entryYear : null,
  });
  return <StudentCourseCatalogView {...data} whatsappHref={getWhatsAppAdminChatHref()} />;
}
