import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { getEnrollmentTokens } from "./actions";
import { TokensDashboard } from "@/components/admin/tokens-dashboard";

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
    <div className="space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Token Aktivasi</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Kelola token pendaftaran siswa untuk kelas.
        </p>
      </div>
      <TokensDashboard initialTokens={tokensList} coursesList={coursesList} />
    </div>
  );
}
