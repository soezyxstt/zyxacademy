import { transferConfig, capabilities } from "@/lib/authoring/transfer/security";
import { transferError } from "@/lib/authoring/transfer/http";

export const runtime = "nodejs";
export function GET() {
  try {
    const info = capabilities(transferConfig());
    return Response.json({ protocol: info.protocol, environmentId: info.environmentId, schemas: info.schemas, sourceFigures: info.sourceFigures, mode: info.mode, overwrite: info.overwrite, mapping: info.mapping }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return transferError(error); }
}
