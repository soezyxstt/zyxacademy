import { notFound } from "next/navigation";
import { AdminSchedulesVisualFixture } from "./visual-fixture";

export const dynamic = "force-dynamic";

export default function AdminSchedulesVisualFixturePage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_VISUAL_FIXTURES !== "true") {
    notFound();
  }

  return <AdminSchedulesVisualFixture />;
}
