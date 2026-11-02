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
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

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
      <Card role="status">
        <CardHeader className="items-center gap-3 text-center">
          <CalendarX2 aria-hidden="true" className="size-6 text-muted-foreground" />
          <CardTitle><TranslatedText namespace="studentExtras.pka" messageKey="registrationClosed" /></CardTitle>
        </CardHeader>
      </Card>
    </CoursePageShell>
  );
}
