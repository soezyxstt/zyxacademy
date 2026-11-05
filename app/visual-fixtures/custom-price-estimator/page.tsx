import { notFound } from "next/navigation";
import { CustomPriceEstimator } from "@/components/admin/custom-price-estimator";

export const dynamic = "force-dynamic";

export default function CustomPriceEstimatorFixturePage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_VISUAL_FIXTURES !== "true") {
    notFound();
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl p-4 md:p-8">
      <CustomPriceEstimator initialVouchers={[]} />
    </main>
  );
}
