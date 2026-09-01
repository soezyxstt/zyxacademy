import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/uploadthing-admin";

export default async function LegacyAssessmentsPage() {
  await assertAdmin();
  redirect("/admin/questions");
}
