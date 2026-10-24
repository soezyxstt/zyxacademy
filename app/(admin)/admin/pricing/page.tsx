import { redirect } from "next/navigation";
import { Calculator } from "lucide-react";
import { CustomPriceEstimator } from "@/components/admin/custom-price-estimator";
import { TutorFeeEstimator } from "@/components/admin/tutor-fee-estimator";
import { VoucherManagementTab } from "@/components/admin/voucher-management-tab";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("pricing.title")), description: t("pricing.description") };
}

export default async function AdminPricingPage() {
  const t = await getTranslations("adminOps");
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Calculator}
        title={<TranslatedText namespace="adminOps" messageKey="pricing.title" />}
      />

      <Tabs defaultValue="student-pricing" paramKey="tab" className="space-y-6">
        <TabsList>
          <TabsTrigger value="student-pricing">{t("pricing.studentTab")}</TabsTrigger>
          <TabsTrigger value="tutor-fee">{t("pricing.tutorTab")}</TabsTrigger>
          <TabsTrigger value="vouchers">{t("pricing.voucherTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="student-pricing">
          <CustomPriceEstimator />
        </TabsContent>

        <TabsContent value="tutor-fee">
          <TutorFeeEstimator />
        </TabsContent>

        <TabsContent value="vouchers">
          <VoucherManagementTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

