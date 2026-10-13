import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { auth } from "@/lib/auth";
import { createMetadata, pageTitle } from "@/lib/site";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { isPkaEnrolled } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = createMetadata({
  title: "Pendaftaran Tutorial PKA",
  description: "Lengkapi data untuk bergabung dengan Tutorial PKA Zyx Academy.",
  path: "/courses/tutorial-pka/daftar",
});


export default async function PkaRegisterPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${PKA_COURSE_ID}/daftar`)}`);
  }

  if (await isPkaEnrolled(session.user.id)) {
    redirect(`/courses/${PKA_COURSE_ID}`);
  }

  return (
    <CoursePageShell
      title="Bergabung dengan Tutorial PKA"
      description="Lengkapi data singkat berikut untuk membuka jadwal live, simulasi, dan materi."
      icon={GraduationCap}
    >
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Pendaftaran Ditutup</CardTitle>
          <CardDescription>
            Mohon maaf, pendaftaran untuk Tutorial PKA saat ini telah ditutup.
          </CardDescription>
        </CardHeader>
      </Card>
    </CoursePageShell>
  );
}
