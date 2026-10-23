import { internalTransfer } from "@/lib/authoring/transfer/http";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  return internalTransfer(request, (await context.params).operation);
}
