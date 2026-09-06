import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards";

export default async function LegacyAssessmentsPage() {
  await assertAdmin();
  redirect("/admin/questions");
}
