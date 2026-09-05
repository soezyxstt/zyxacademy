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

export const metadata: Metadata = {
  title: pageTitle("Preferensi Notifikasi"),
  description: "Atur jenis notifikasi surel opsional yang Anda terima dari Zyx Academy.",
};

export default async function NotificationPreferencesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id || !session.user.email) {
    redirect(`/sign-in?next=${encodeURIComponent("/settings/notifications")}`);
  }

  const preferences = await getEmailNotificationPreferences(session.user.id);
  return (
    <ApplicationPage>
      <PageHeader
        title="Preferensi Notifikasi"
        icon={Bell}
        backHref="/settings"
        backLabel="Pengaturan Akun"
      />
      <Reveal className="mt-6">
        <NotificationPreferencesForm accountEmail={session.user.email} initialPreferences={preferences} />
      </Reveal>
    </ApplicationPage>
  );
}
