import { redirect } from "next/navigation";

export default function LegacyProductBundlePage() {
  redirect("/admin/materials/review?section=product");
}
