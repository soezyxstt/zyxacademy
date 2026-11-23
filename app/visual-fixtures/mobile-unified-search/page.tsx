import { notFound } from "next/navigation";
import { MobileUnifiedSearchFixtureClient } from "./fixture-client";

export const dynamic = "force-dynamic";

export default function MobileUnifiedSearchFixturePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MobileUnifiedSearchFixtureClient />;
}
