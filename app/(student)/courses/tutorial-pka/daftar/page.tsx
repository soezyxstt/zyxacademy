import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarX2, GraduationCap } from "lucide-react";
import { auth } from "@/lib/auth";
import { createMetadata } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { isPkaEnrolled } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("studentExtras.pka");
  return createMetadata({ title: t("registrationTitle"), description: t("registrationDescription"), path: "/courses/tutorial-pka/daftar" });
}


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
      title={<TranslatedText namespace="studentExtras.pka" messageKey="joinTitle" />}
      icon={GraduationCap}
    >
      <div role="status" className="flex items-center gap-3 border-b border-border pb-3">
        <CalendarX2 aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        <p className="font-heading text-body-base font-bold"><TranslatedText namespace="studentExtras.pka" messageKey="registrationClosed" /></p>
      </div>
    </CoursePageShell>
  );
}
