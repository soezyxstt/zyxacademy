import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { NotificationPreferencesForm } from "./notification-preferences-form";
import { auth } from "@/lib/auth";
import { getEmailNotificationPreferences } from "@/lib/email-preferences/repository";
import { pageTitle } from "@/lib/site";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return { title: pageTitle(t("notificationPreferences.title")), description: t("notificationPreferences.metadataDescription") };
}

export default async function NotificationPreferencesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id || !session.user.email) {
    redirect(`/sign-in?next=${encodeURIComponent("/settings/notifications")}`);
  }

  const preferences = await getEmailNotificationPreferences(session.user.id);
  return (
    <ApplicationPage>
      <PageHeader
        title={<TranslatedText namespace="student" messageKey="notificationPreferences.title" />}
        icon={Bell}
        backHref="/settings"
        backLabel={<TranslatedText namespace="student" messageKey="settings.title" />}
      />
      <Reveal className="mt-6">
        <NotificationPreferencesForm accountEmail={session.user.email} initialPreferences={preferences} />
      </Reveal>
    </ApplicationPage>
  );
}
