import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { getAdminStudyGroups } from "./actions";
import { GroupsDashboard } from "@/components/admin/groups-dashboard";
import { PageHeader } from "@/components/page-header";
import { Users } from "lucide-react";

export const metadata: Metadata = {
  title: pageTitle("Kelompok Belajar"),
  description: "Kelola konfigurasi kelompok belajar, paket kuota sesi semester, dan anggota murid.",
};

export default async function AdminGroupsPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  const [groupsList, allCourses] = await Promise.all([
    getAdminStudyGroups(),
    db.select().from(courses),
  ]);

  const coursesList = allCourses.map((c) => ({
    id: c.id,
    title: c.title,
    category: c.category,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Kelompok Belajar"
      />
      <GroupsDashboard initialGroups={groupsList} coursesList={coursesList} />
    </div>
  );
}
