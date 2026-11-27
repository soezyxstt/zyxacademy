import { HardDriveDownload } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { OfflineCacheSettings } from "@/components/admin/offline-cache-settings";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import { getTranslations } from "@/lib/i18n/server";
import { pageTitle } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps.offlineCache");
  return { title: pageTitle(t("title")) };
}

export default async function OfflineCacheAdminPage() {
  await assertAdmin();
  const t = await getTranslations("adminOps.offlineCache");
  return <div className="space-y-5"><AdminPageHeader icon={HardDriveDownload} title={t("title")} /><OfflineCacheSettings /></div>;
}
