import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createMetadata, pageTitle } from "@/lib/site";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getStudentStudyGroups } from "./actions";
import { StudentGroupsCompactClient } from "@/components/dashboard/student-groups-compact-client";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Users } from "lucide-react";

export const metadata: Metadata = createMetadata({
  title: "Kelompok Belajar",
  description: "Informasi kelompok belajar, kuota sesi pertemuan semester, rekan belajar, dan mata kuliah Anda.",
  path: "/dashboard/groups",
});


export default async function StudentGroupsPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });

  if (!session?.user?.id) {
    redirect("/auth/sign-in?callbackUrl=/dashboard/groups");
  }

  const groups = await getStudentStudyGroups();

  return (
    <ApplicationPage>
      <PageHeader icon={Users} title="Kelompok Belajar" />
      <Suspense fallback={null}>
        <StudentGroupsCompactClient initialGroups={groups} />
      </Suspense>
    </ApplicationPage>
  );
}
