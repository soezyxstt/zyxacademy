import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Calculator } from "lucide-react";
import { CustomPriceEstimator } from "@/components/admin/custom-price-estimator";
import { AdminPageHeader } from "@/components/admin/page-header";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Kalkulator harga custom"),
  description: "Hitung perkiraan harga paket custom berdasarkan sesi, mata kuliah, dan anggota kelompok.",
};

export default async function AdminPricingPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={Calculator}
        title="Kalkulator harga custom"
        description="Hitung perkiraan harga paket custom berdasarkan kebutuhan kelompok."
      />
      <CustomPriceEstimator />
    </div>
  );
}
