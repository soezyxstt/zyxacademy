import { redirect } from "next/navigation";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";

export default async function LegacyDiktatPage() {
  await assertTutorOrAdmin();
  redirect("/admin/materials/review?section=product");
}
