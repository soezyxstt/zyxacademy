import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { getAdminUsersData } from "./actions";
import { UsersDashboard } from "@/components/admin/users-dashboard";
import { PageHeader } from "@/components/page-header";
import { UserCog } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("users.title")), description: t("users.description") };
}

export default async function AdminUsersPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  const { users, stats, currentUserId } = await getAdminUsersData();

  return (
    <div className="space-y-4">
      <PageHeader
        icon={UserCog}
        title={<TranslatedText namespace="adminOps" messageKey="users.title" />}
      />
      <UsersDashboard
        initialUsers={users}
        initialStats={stats}
        currentUserId={currentUserId}
      />
    </div>
  );
}
