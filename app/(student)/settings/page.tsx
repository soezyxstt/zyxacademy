import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthUser, type AuthUser } from "@/lib/auth-session";
import { getEmailNotificationPreferences } from "@/lib/email-preferences/repository";
import { getTranslations } from "@/lib/i18n/server";
import { createMetadata } from "@/lib/site";
import { Skeleton } from "@/components/ui/skeleton";
import { getProfileEditorData, ProfileEditor } from "../profile/edit/profile-editor";
import { NotificationPreferencesForm } from "./notifications/notification-preferences-form";
import { SettingsClient } from "./settings-client";
import { resolveSettingsTab } from "@/lib/settings-tabs";

export async function generateMetadata(): Promise<Metadata> {
  const [common, student] = await Promise.all([getTranslations("common"), getTranslations("student")]);
  return createMetadata({ title: common("preferences"), description: student("settings.metadataDescription"), path: "/settings" });
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [account, query] = await Promise.all([getAuthUser(), searchParams]);
  const initialTab = resolveSettingsTab(query.tab);
  if (!account?.id) {
    const next = initialTab === "general" ? "/settings" : `/settings?tab=${initialTab}`;
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  return (
    <SettingsClient
      initialTab={initialTab}
      profile={(
        <Suspense fallback={<SettingsPanelSkeleton />}>
          <AccountProfile account={account} />
        </Suspense>
      )}
      email={(
        <Suspense fallback={<SettingsPanelSkeleton />}>
          <AccountEmailPreferences account={account} />
        </Suspense>
      )}
    />
  );
}

async function AccountProfile({ account }: { account: AuthUser }) {
  const editorData = await getProfileEditorData(account);
  return <ProfileEditor {...editorData} stayOnPage />;
}

async function AccountEmailPreferences({ account }: { account: AuthUser }) {
  const preferences = await getEmailNotificationPreferences(account.id);
  return <NotificationPreferencesForm accountEmail={account.email} initialPreferences={preferences} />;
}

function SettingsPanelSkeleton() {
  return (
    <div aria-busy="true" className="space-y-(--related-gap)">
      <Skeleton className="h-6 w-40 max-w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
