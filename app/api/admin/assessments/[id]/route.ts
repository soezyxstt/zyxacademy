import { retiredAdminAuthoringResponse } from "@/lib/admin/legacy-authoring-retirement";

export async function DELETE() {
  return retiredAdminAuthoringResponse("/admin/questions");
}
