import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/uploadthing-admin";

export default async function LegacyAssessmentDetailPage() {
  await assertAdmin();
  redirect("/admin/questions");
}
