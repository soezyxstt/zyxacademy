import { notFound } from "next/navigation";
import { TutorFeeEstimator } from "@/components/admin/tutor-fee-estimator";

export const dynamic = "force-dynamic";

export default function TutorFeeEstimatorFixturePage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_VISUAL_FIXTURES !== "true") {
    notFound();
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl p-4 md:p-8">
      <TutorFeeEstimator />
    </main>
  );
}
