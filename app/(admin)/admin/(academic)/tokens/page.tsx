import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { getEnrollmentTokens } from "./actions";
import { TokensDashboard } from "@/components/admin/tokens-dashboard";
import { AdminPageHeader } from "@/components/admin/page-header";
import { KeyRound } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("tokens.title")), description: t("tokens.description") };
}

export default async function AdminTokensPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  // Fetch initial token rows and list of courses for dropdown selector
  const [tokensList, allCourses] = await Promise.all([
    getEnrollmentTokens(),
    db.select().from(courses),
  ]);

  const coursesList = allCourses.map((c) => ({
    id: c.id,
    title: c.title,
  }));

  return (
    <div className="space-y-4">
      <AdminPageHeader
        icon={KeyRound}
        title={<TranslatedText namespace="adminOps" messageKey="tokens.title" />}
      />
      <TokensDashboard initialTokens={tokensList} coursesList={coursesList} />
    </div>
  );
}
