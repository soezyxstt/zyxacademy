import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { getAdminStudyGroups } from "./actions";
import { GroupsDashboard } from "@/components/admin/groups-dashboard";
import { PageHeader } from "@/components/page-header";
import { Users } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("groups.title")), description: t("groups.description") };
}

export default async function AdminGroupsPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  const [groupData, allCourses] = await Promise.all([
    getAdminStudyGroups(),
    db.select({ id: courses.id, title: courses.title, category: courses.category }).from(courses),
  ]);

  const coursesList = allCourses.map((c) => ({
    id: c.id,
    title: c.title,
    category: c.category,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Users}
        title={<TranslatedText namespace="adminOps" messageKey="groups.title" />}
      />
      <GroupsDashboard initialGroups={groupData.groups} initialStats={groupData.stats} initialTotal={groupData.total} coursesList={coursesList} />
    </div>
  );
}
