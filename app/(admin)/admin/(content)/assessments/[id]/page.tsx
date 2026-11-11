import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards-server";

export default async function LegacyAssessmentDetailPage() {
  await assertAdmin();
  redirect("/admin/questions");
}
