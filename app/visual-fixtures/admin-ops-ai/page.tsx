import { notFound } from "next/navigation";
import { AdminOpsAiVisualFixture } from "./visual-fixture";

export const dynamic = "force-dynamic";

export default async function AdminOpsAiVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    width?: string;
  }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { state, width } = await searchParams;
  const initialWidth = width ? Number.parseInt(width, 10) : undefined;

  return (
    <AdminOpsAiVisualFixture
      state={state || "closed"}
      initialWidth={Number.isNaN(initialWidth) ? undefined : initialWidth}
    />
  );
}
