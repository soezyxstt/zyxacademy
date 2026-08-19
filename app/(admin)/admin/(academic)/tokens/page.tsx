import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { getEnrollmentTokens } from "./actions";
import { TokensDashboard } from "@/components/admin/tokens-dashboard";
import { AdminPageHeader } from "@/components/admin/page-header";
import { KeyRound } from "lucide-react";

export const metadata: Metadata = {
  title: pageTitle("Token Pendaftaran"),
  description: "Kelola token pendaftaran siswa untuk kelas.",
};

export default async function AdminTokensPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  // Fetch initial token rows and list of courses for dropdown selector
  const [tokensList, allCourses] = await Promise.all([
    getEnrollmentTokens(),
    db.select().from(courses),
  ]);

  const coursesList = allCourses.map((c) => ({
    id: c.id,
    title: c.title,
  }));

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={KeyRound}
        title="Token Aktivasi"
        description="Kelola token pendaftaran siswa untuk kelas."
      />
      <TokensDashboard initialTokens={tokensList} coursesList={coursesList} />
    </div>
  );
}
