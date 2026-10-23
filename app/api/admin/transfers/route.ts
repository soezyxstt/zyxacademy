import { adminTransferRequest } from "@/lib/authoring/transfer/admin-http";
import { executeTransfer } from "@/lib/authoring/transfer/destination";

export const runtime = "nodejs";
export async function POST(request: Request) { return adminTransferRequest(request, executeTransfer); }
