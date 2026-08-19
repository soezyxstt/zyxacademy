import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getStudentStudyGroups } from "./actions";
import { StudentGroupsClient } from "@/components/dashboard/student-groups-client";
import { PageHeader } from "@/components/page-header";
import { Users } from "lucide-react";

export const metadata: Metadata = {
  title: pageTitle("Kelompok Belajar"),
  description: "Informasi kelompok belajar, kuota sesi pertemuan semester, rekan belajar, dan mata kuliah Anda.",
};

export default async function StudentGroupsPage() {
  const h = await headers();
  const session = await auth.api.getSession({
    headers: h,
  });

  if (!session?.user?.id) {
    redirect("/auth/sign-in?callbackUrl=/dashboard/groups");
  }

  const groups = await getStudentStudyGroups();

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 sm:px-6 py-4">
      <PageHeader
        icon={Users}
        title="Kelompok Belajar"
      />
      <StudentGroupsClient initialGroups={groups} />
    </div>
  );
}
