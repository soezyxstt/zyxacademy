"use client";
import { PricingDiscountSettings } from "@/components/admin/pricing-discount-settings";
import { DEFAULT_PRICING_DISCOUNTS } from "@/lib/pricing-discounts";
import { PlanPrice, PlanPromotion } from "@/components/pricing/plan-price";
import { CustomPriceEstimator } from "@/components/admin/custom-price-estimator";
import { TutorFeeEstimator } from "@/components/admin/tutor-fee-estimator";

export function PricingDiscountFixture({ failSave }: { failSave: boolean }) {
  return <>
    <PricingDiscountSettings initialSettings={DEFAULT_PRICING_DISCOUNTS} save={async (data) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (failSave) return { success: false, error: "Fixture save failure" };
      return { success: true, data };
    }} />
    <div className="grid gap-4 sm:grid-cols-3">{(["minimal", "essential", "premium"] as const).map((plan) => <div key={plan}><h2 className="font-heading text-body-base font-bold">{plan}</h2><PlanPrice plan={plan} persons={3} courses={3} /></div>)}</div>
    <PlanPromotion />
    <CustomPriceEstimator initialVouchers={[{ id: "fixture", code: "HEMAT10", discountPercent: 10, remainingQuota: 5, expiresAt: new Date("2027-12-31"), description: null }]} />
    <TutorFeeEstimator />
  </>;
}
