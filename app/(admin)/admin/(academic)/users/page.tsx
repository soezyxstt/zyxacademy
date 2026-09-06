import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { getAdminUsersData } from "./actions";
import { UsersDashboard } from "@/components/admin/users-dashboard";
import { PageHeader } from "@/components/page-header";
import { UserCog } from "lucide-react";

export const metadata: Metadata = {
  title: pageTitle("Manajemen Pengguna"),
  description: "Monitor akun dan kelola peran pengguna sistem.",
};

export default async function AdminUsersPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  const { users, stats, currentUserId } = await getAdminUsersData();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UserCog}
        title="Manajemen Pengguna"
      />
      <UsersDashboard
        initialUsers={users}
        initialStats={stats}
        currentUserId={currentUserId}
      />
    </div>
  );
}
