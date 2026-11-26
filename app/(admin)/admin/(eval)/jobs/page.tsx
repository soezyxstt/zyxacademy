import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";
import { readGenerationJobs } from "./jobs-read-model";
import { GenerationJobsClient } from "./jobs-client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Zap } from "lucide-react";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminEval");
  return { title: pageTitle(t("metadata.generationJobs")) };
}

export default async function GenerationJobsPage() {
  await assertTutorOrAdmin();

  const snapshot = await readGenerationJobs();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={Zap}
        title={<TranslatedText namespace="adminEval" messageKey="routes.generationJobs" />}
      />
      <GenerationJobsClient {...snapshot} />
    </div>
  );
}
