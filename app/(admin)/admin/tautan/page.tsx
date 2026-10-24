import { redirect } from "next/navigation";
import { LinkIcon } from "lucide-react";

import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { AdminPageHeader } from "@/components/admin/page-header";
import { LinksManager } from "@/components/admin/links-manager";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("links.title")), description: t("links.description") };
}

export const dynamic = "force-dynamic";

export default async function AdminTautanPage() {
  const t = await getTranslations("adminOps");
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={LinkIcon}
        title={<TranslatedText namespace="adminOps" messageKey="links.title" />}
      />
      <LinksManager />
    </div>
  );
}
