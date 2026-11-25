import { notFound } from "next/navigation";
import { StickyTabsFixture } from "./fixture";

export const dynamic = "force-dynamic";

export default async function StickyTabsFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_VISUAL_FIXTURES !== "true") {
    notFound();
  }

  const { mode } = await searchParams;
  return <StickyTabsFixture mode={mode === "dual" || mode === "midpage" ? mode : "single"} />;
}
