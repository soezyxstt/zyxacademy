import { Suspense } from "react";
import { FormsBuilderSkeleton } from "./loading-skeleton";

import { FileText } from "lucide-react";

import { pageTitle } from "@/lib/site";
import { AdminPageHeader } from "@/components/admin/page-header";
import AdminFormsBuilder from "@/components/forms/admin-forms-builder";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("forms.title")), description: t("forms.description") };
}

export default async function AdminFormsPage() {
  const presetsEnabled = true;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={FileText}
        title={<TranslatedText namespace="adminOps" messageKey="forms.title" />}
      />
      <Suspense
        fallback={<FormsBuilderSkeleton />}
      >
        <AdminFormsBuilder presetsEnabled={presetsEnabled} />
      </Suspense>
    </div>
  );
}
