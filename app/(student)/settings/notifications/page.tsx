import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NotificationPreferencesForm } from "./notification-preferences-form";
import { auth } from "@/lib/auth";
import { getEmailNotificationPreferences } from "@/lib/email-preferences/repository";
import { pageTitle } from "@/lib/site";
import { ShellPage } from "@/components/shell-page";

export const metadata: Metadata = {
  title: pageTitle("Notification preferences"),
  description: "Choose which optional email notifications you receive from Zyx Academy.",
};

export default async function NotificationPreferencesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id || !session.user.email) {
    redirect(`/sign-in?next=${encodeURIComponent("/settings/notifications")}`);
  }

  const preferences = await getEmailNotificationPreferences(session.user.id);
  return (
    <ShellPage
      title="Notification preferences"
      description="Choose which optional email you receive. Essential account messages remain enabled."
    >
      <NotificationPreferencesForm accountEmail={session.user.email} initialPreferences={preferences} />
    </ShellPage>
  );
}
