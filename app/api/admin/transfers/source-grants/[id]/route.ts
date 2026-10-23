import { adminTransferRequest } from "@/lib/authoring/transfer/admin-http";
import { revokeSourceGrant } from "@/lib/authoring/transfer/source";

export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminTransferRequest(request, async (_config, actor) => revokeSourceGrant(id, actor), false, true);
}
