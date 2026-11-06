import { notFound } from "next/navigation";
import { AdminOpsModelsVisualFixture } from "./visual-fixture";

export const dynamic = "force-dynamic";

export default async function AdminOpsModelsVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
  }>;
}) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_VISUAL_FIXTURES !== "true") {
    notFound();
  }

  const { state } = await searchParams;
  return <AdminOpsModelsVisualFixture state={state || "mixed"} />;
}
