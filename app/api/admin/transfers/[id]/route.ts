import { adminTransferRequest } from "@/lib/authoring/transfer/admin-http";
import { transferStatus } from "@/lib/authoring/transfer/destination";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminTransferRequest(request, async (_config, actor) => transferStatus(id, actor), true);
}
