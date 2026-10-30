import type { Metadata } from "next";
import { headers } from "next/headers";
import { MessageSquareHeart } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata, pageTitle } from "@/lib/site";
import { auth } from "@/lib/auth";
import { FeedbackForm } from "./feedback-form";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return createMetadata({ title: t("feedback.title"), description: t("feedback.metadataDescription"), path: "/feedback" });
}


export default async function FeedbackPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userEmail = session?.user?.email;

  return (
    <ApplicationPage>
      <PageHeader
        title={<TranslatedText namespace="student" messageKey="feedback.title" />}
        icon={MessageSquareHeart}
      />

      <Reveal className="mt-4">
        <FeedbackForm initialEmail={userEmail} />
      </Reveal>
    </ApplicationPage>
  );
}
