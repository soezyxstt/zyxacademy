import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Calculator } from "lucide-react";
import { CustomPriceEstimator } from "@/components/admin/custom-price-estimator";
import { TutorFeeEstimator } from "@/components/admin/tutor-fee-estimator";
import { VoucherManagementTab } from "@/components/admin/voucher-management-tab";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Kalkulator harga & voucher"),
  description: "Hitung harga paket murid, estimasi fee tutor, dan kelola voucher diskon.",
};

export default async function AdminPricingPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Calculator}
        title="Kalkulator harga & voucher"
      />

      <Tabs defaultValue="student-pricing" paramKey="tab" className="space-y-6">
        <TabsList>
          <TabsTrigger value="student-pricing">Harga paket murid</TabsTrigger>
          <TabsTrigger value="tutor-fee">Fee tutor</TabsTrigger>
          <TabsTrigger value="vouchers">Kelola voucher</TabsTrigger>
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

