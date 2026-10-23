import { adminTransferRequest } from "@/lib/authoring/transfer/admin-http";
import { createSourceGrant } from "@/lib/authoring/transfer/source";

export const runtime = "nodejs";
export async function POST(request: Request) { return adminTransferRequest(request, createSourceGrant); }
