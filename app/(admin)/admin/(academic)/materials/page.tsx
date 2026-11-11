import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards-server";

export default async function LegacyMaterialsPage() {
  await assertAdmin();
  redirect("/admin/materials/review?section=catalog");
}
