import { redirect } from "next/navigation";

import { Images } from "lucide-react";

import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { AdminPageHeader } from "@/components/admin/page-header";
import { MediaManager } from "@/components/admin/media-manager";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("media.title")), description: t("media.description") };
}

export default async function AdminMediaPage() {
  const t = await getTranslations("adminOps");
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={Images}
        title={<TranslatedText namespace="adminOps" messageKey="media.title" />}
        description={t("media.storageNote")}
      />
      <MediaManager />
    </div>
  );
}
