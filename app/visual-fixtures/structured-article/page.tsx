import { notFound } from "next/navigation";
import { StructuredArticleVisualFixture } from "./visual-fixture";

export const dynamic = "force-dynamic";

export default async function StructuredArticleVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; catalogueTitle?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { mode, catalogueTitle } = await searchParams;
  return <StructuredArticleVisualFixture mode={mode === "idea" || mode === "product" ? mode : "student"} catalogueTitle={catalogueTitle === "1"} />;
}
