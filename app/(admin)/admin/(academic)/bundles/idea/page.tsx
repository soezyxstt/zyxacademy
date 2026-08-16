import { redirect } from "next/navigation";

export default function LegacyIdeaBundlePage() {
  redirect("/admin/materials?tab=review&section=idea");
}
