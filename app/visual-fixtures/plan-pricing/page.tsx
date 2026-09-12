import { notFound } from "next/navigation";
import { DashboardPlanPreview } from "@/components/dashboard/plan-preview";
import { StudentOnboardingView } from "@/components/dashboard/student-onboarding-view";

export const dynamic = "force-dynamic";

export default async function PlanPricingFixture({ searchParams }: {
  searchParams: Promise<{ surface?: string }>;
}) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_VISUAL_FIXTURES !== "true") {
    notFound();
  }
  const { surface } = await searchParams;
  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl p-4 md:p-8">
      {surface === "onboarding"
        ? <StudentOnboardingView userName="Siswa Demo" catalogCourses={[]} />
        : <DashboardPlanPreview />}
    </main>
  );
}
