import { z } from "zod";
import { transferConfig, peerFor, verifyToken, capabilities, signToken } from "./security";
import { errorCode, fail, sha256, stableJson, transferId } from "./contracts";
import { claimSnapshot, liveGrant, readSnapshotArtifact } from "./source";
import { readBoundedBytes } from "./destination";

export async function readTransferJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") fail("TRANSFER_JSON_REQUIRED");
  return JSON.parse(new TextDecoder().decode(await readBoundedBytes(new Response(request.body), 192 * 1024)));
}
export function transferError(error: unknown): Response {
  const code = error instanceof z.ZodError ? "TRANSFER_INPUT_INVALID" : errorCode(error);
  const status = code === "GRANT_REVOKED" || code === "GRANT_INVALID" || code === "PEER_DIRECTION_FORBIDDEN" ? 403
    : code.endsWith("NOT_FOUND") ? 404 : code === "PLAN_STALE" || code.includes("CONFLICT") || code === "SOURCE_REVISION_CHANGED" ? 409
      : code === "TRANSFER_CONFIGURATION_REQUIRED" || code === "PEER_TEMPORARILY_UNAVAILABLE" ? 503 : 422;
  return Response.json({ error: code }, { status, headers: { "cache-control": "no-store" } });
}
export async function internalTransfer(request: Request, operation: string) {
  try {
    const config = transferConfig();
    const peer = peerFor(config, request.headers.get("x-transfer-peer") || "", "destination");
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ") || auth.length > 10000) fail("GRANT_INVALID");
    const proof = await verifyToken(config, peer, auth.slice(7), "peer-request");
    const body = await readTransferJson(request);
    if (proof.operation !== operation || proof.bodyHash !== sha256(stableJson(body))) fail("GRANT_INVALID");
    const base = z.object({ grantToken: z.string().max(16000), transferId: transferId.optional(), artifactId: transferId.optional() }).strict().parse(body);
    const grantToken = await verifyToken(config, null, base.grantToken, "source-grant", peer.id);
    if (typeof grantToken.grantId !== "string") fail("GRANT_INVALID");
    const grant = await liveGrant(grantToken.grantId, peer.id, base.transferId);
    if (grantToken.closureHash !== grant.inventory.closureHash) fail("GRANT_INVALID");
    if (operation === "inspect") return Response.json({ token: await signToken(config, "inventory", peer.id, { ...capabilities(config), inventory: grant.inventory }, 900) }, { headers: { "cache-control": "no-store" } });
    if (!base.transferId) fail("TRANSFER_INPUT_INVALID");
    if (operation === "snapshots") return Response.json(await claimSnapshot(grant.id, peer.id, base.transferId), { headers: { "cache-control": "no-store" } });
    if (operation === "artifact" && base.artifactId) {
      const { bytes, descriptor } = await readSnapshotArtifact(grant.id, peer.id, base.transferId, base.artifactId);
      let offset = 0;
      const stream = new ReadableStream<Uint8Array>({ pull(controller) {
        if (offset === bytes.length) { controller.close(); return; }
        const end = Math.min(bytes.length, offset + 64 * 1024);
        controller.enqueue(bytes.slice(offset, end)); offset = end;
      } });
      return new Response(stream, { headers: { "content-type": "application/zip", "content-length": String(bytes.length), "cache-control": "no-store", etag: `"${descriptor.byteHash}"` } });
    }
    fail("TRANSFER_OPERATION_UNSUPPORTED");
  } catch (error) { return transferError(error); }
}
