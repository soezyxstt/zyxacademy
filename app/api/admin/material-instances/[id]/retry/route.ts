import { retiredAdminAuthoringResponse } from "@/lib/admin/legacy-authoring-retirement";

export async function POST() {
  return retiredAdminAuthoringResponse("/admin/materials/manual");
}
