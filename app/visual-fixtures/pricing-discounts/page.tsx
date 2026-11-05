import { notFound } from "next/navigation";
import { PricingDiscountFixture } from "./fixture";

export default async function Page({ searchParams }: { searchParams: Promise<{ failSave?: string }> }) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_VISUAL_FIXTURES !== "true") notFound();
  return <main id="main-content" className="mx-auto max-w-6xl space-y-6 p-4 md:p-8"><PricingDiscountFixture failSave={(await searchParams).failSave === "1"} /></main>;
}
