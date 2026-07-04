import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { auth } from "@/lib/auth";
import { pageTitle } from "@/lib/site";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { isPkaEnrolled } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { PkaRegistrationForm } from "../_components/registration-form";

export const metadata: Metadata = {
  title: pageTitle("Tutorial PKA - Pendaftaran"),
  description: "Lengkapi data untuk bergabung dengan Tutorial PKA.",
};

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
      <PkaRegistrationForm
        googleEmail={session.user.email}
        defaultName={session.user.name ?? ""}
      />
    </CoursePageShell>
  );
}
