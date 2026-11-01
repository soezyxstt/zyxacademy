import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createMetadata} from "@/lib/site";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getStudentStudyGroups } from "./actions";
import { StudentGroupsCompactClient } from "@/components/dashboard/student-groups-compact-client";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Users } from "lucide-react";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return createMetadata({ title: t("groups.title"), description: t("groups.metadataDescription"), path: "/dashboard/groups" });
}


export default async function StudentGroupsPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });

  if (!session?.user?.id) {
    redirect("/auth/sign-in?callbackUrl=/dashboard/groups");
  }

  const groups = await getStudentStudyGroups();

  return (
    <ApplicationPage>
      <PageHeader icon={Users} title={<TranslatedText namespace="student" messageKey="navigation.groups" />} />
      <Suspense fallback={null}>
        <StudentGroupsCompactClient initialGroups={groups} />
      </Suspense>
    </ApplicationPage>
  );
}
