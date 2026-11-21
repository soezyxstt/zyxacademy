import { notFound } from "next/navigation";
import { StickyTabsFixture } from "./fixture";

export const dynamic = "force-dynamic";

export default function StickyTabsFixturePage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_VISUAL_FIXTURES !== "true") {
    notFound();
  }

  return <StickyTabsFixture />;
}
