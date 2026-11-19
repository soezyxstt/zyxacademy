import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pageTitle } from "@/lib/site";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";
import { getProfileEditorData, ProfileEditor } from "./profile-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return { title: pageTitle(t("metadata.profileEditTitle")), description: t("metadata.profileEditDescription") };
}

/**
 * Server-rendered page allowing students to view and update their ITB academic profile.
 */
export default async function ProfileEditPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });

  if (!session?.user?.id) {
    redirect(`/sign-in?next=${encodeURIComponent("/profile/edit")}`);
  }

  const editorData = await getProfileEditorData(session.user);
  return (
    <ApplicationPage maxWidth="7xl" spacing="space-y-(--compact-gap)">
      <PageHeader
        title={<TranslatedText namespace="student" messageKey="profile.editTitle" />}
      />
      <Reveal>
        <ProfileEditor {...editorData} />
      </Reveal>
    </ApplicationPage>
  );
}
