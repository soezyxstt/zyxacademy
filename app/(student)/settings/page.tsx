import type { Metadata } from "next";
import { headers } from "next/headers";
import { createMetadata } from "@/lib/site";
import { auth } from "@/lib/auth";
import { SettingsClient } from "./settings-client";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return createMetadata({ title: t("settings.title"), description: t("settings.metadataDescription"), path: "/settings" });
}


export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  return <SettingsClient userName={user?.name ?? null} userEmail={user?.email ?? null} />;
}
