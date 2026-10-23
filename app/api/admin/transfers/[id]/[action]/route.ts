import { adminTransferRequest } from "@/lib/authoring/transfer/admin-http";
import { controlTransfer } from "@/lib/authoring/transfer/destination";
import { fail } from "@/lib/authoring/transfer/contracts";
import { z } from "zod";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await context.params;
  return adminTransferRequest(request, async (config, actor, body) => {
    if (action !== "cancel" && action !== "resume") fail("TRANSFER_OPERATION_UNSUPPORTED");
    const input = action === "resume" ? z.object({ sourceGrant: z.string().max(16000).optional() }).strict().parse(body) : {};
    return controlTransfer(config, id, actor, action, "sourceGrant" in input ? input.sourceGrant as string | undefined : undefined);
  }, false, action !== "resume");
}
