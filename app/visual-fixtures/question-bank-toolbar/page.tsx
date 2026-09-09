import { notFound } from "next/navigation";
import { QuestionBankToolbarVisualFixture } from "./visual-fixture";

export const dynamic = "force-dynamic";

export default async function QuestionBankToolbarVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_VISUAL_FIXTURES !== "true") {
    notFound();
  }

  const { tab } = await searchParams;
  return <QuestionBankToolbarVisualFixture initialTab={tab === "historical" ? "historical" : "ai-generated"} />;
}
