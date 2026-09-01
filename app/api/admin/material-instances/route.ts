import { retiredAdminAuthoringResponse } from "@/lib/admin/legacy-authoring-retirement";

const replacementHref = "/admin/materials/manual";

export async function GET() {
  return retiredAdminAuthoringResponse(replacementHref);
}

export async function POST() {
  return retiredAdminAuthoringResponse(replacementHref);
}

export async function DELETE() {
  return retiredAdminAuthoringResponse(replacementHref);
}
