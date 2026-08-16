import { redirect } from "next/navigation";

export default function LegacyProductBundlePage() {
  redirect("/admin/materials?tab=review&section=product");
}
